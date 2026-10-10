<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Proposta determinística de rateio para venda QUITADA.
 * O cliente paga o título; este serviço divide a comissão, não faz repasse.
 * Não substitui rateios lançados pelo administrador nem pagas.
 */
final class RateioAutomatico
{
    private static function pct(string $rate): int
    {
        if(!preg_match('/^(?:\d{1,2}|100)(?:\.\d{1,2})?$/D',$rate))throw new \InvalidArgumentException('Percentual inválido.');
        [$integer,$fraction]=array_pad(explode('.',$rate,2),2,'');
        $bp=(int)$integer*100+(int)str_pad($fraction,2,'0');
        if($bp>10000)throw new \InvalidArgumentException('Percentual acima de 100%.');
        return $bp;
    }

    private static function fraction(int $cents,int $basisPoints): int
    {
        return intdiv($cents*$basisPoints+5000,10000);
    }

    /**
     * Regra mais específica (modalidade do recebimento + tipo do dia).
     * A parametrização pertence à versão do plano; não altera o histórico.
     */
    private static function exception(array $op,string $role,string $payment,string $day): ?array
    {
        $rules=$op['_regras_especiais']??[];
        foreach([$payment,$payment,'TODOS','TODOS'] as $i=>$mode){
            $kind=$i%2===0?$day:'TODOS';
            foreach($rules as $rule){
                if($rule['papel']===$role && $rule['modalidade']===$mode && $rule['tipo_dia']===$kind){
                    return $rule;
                }
            }
        }
        return null;
    }

    private static function customAmount(?array $rule,int $price,int $default): int
    {
        if(!$rule)return $default;
        if($rule['tipo_calculo']==='FIXO'){
            $amount=VendaMoney::cents((string)$rule['valor'],true);
            if($amount===null)throw new \InvalidArgumentException('Valor fixo inválido.');
            return $amount;
        }
        if($rule['tipo_calculo']==='PERCENTUAL'){
            return self::fraction($price,self::pct((string)$rule['valor']));
        }
        throw new \InvalidArgumentException('Tipo de regra personalizada inválido.');
    }

    /**
     * Pure function, testable without database.
     * @return array{rateios:array,avisos:array}
     */
    public static function propose(array $op,array $policy,bool $holiday=false,bool $renewalOther=false): array
    {
        $base=VendaMoney::cents((string)($op['comissao_ajustada']??$op['comissao_prevista']??''));
        $table=VendaMoney::cents((string)($op['valor_tabela']??''));
        $root=(int)($op['corretor_pessoa_id']??0);
        if($base===null||$table===null||$root<1)throw new \InvalidArgumentException('Venda sem comissão e corretor definidos.');
        $date=\DateTimeImmutable::createFromFormat('!Y-m-d',(string)$op['data_venda']);
        if(!$date||$date->format('Y-m-d')!==$op['data_venda'])throw new \InvalidArgumentException('Data da venda inválida.');
        $businessDay=(int)$date->format('N')<=5 && !$holiday;
        $serviceRate=self::pct((string)($policy[$businessDay?'percentual_atendente_dia_util':'percentual_atendente_outros_dias']??''));
        $managerRate=self::pct((string)($policy['percentual_gerente']??''));
        $secondRate=self::pct((string)($policy['divisao_segundo_corretor']??''));
        $receivers=[];
        foreach(['atendente_pessoa_id','atendente_adicional_pessoa_id'] as $key){
            $id=(int)($op[$key]??0);
            if($id>0 && $id!==$root && !in_array($id,$receivers,true))$receivers[]=$id;
        }
        $out=[];$notes=[];
        // Sem modalidade conhecida, nunca atribuir adicional à vista por suposição.
        $payment='DESCONHECIDA';
        $snap=json_decode((string)($op['regra_snapshot']??''),true);
        if(is_array($snap) && in_array(($snap['modalidade']??''),['AVISTA','CARTAO','MISTO'],true)){
            $payment=$snap['modalidade'];
        }
        $day=$businessDay?'UTIL':'OUTROS';
        $serviceOverride=self::exception($op,'ATENDENTE',$payment,$day);
        $managerOverride=self::exception($op,'GERENTE',$payment,$day);
        $available=$base;
        if($receivers){
            $total=self::fraction($table,$serviceRate);
            // A regra de 12 meses se aplica a qualquer versão do plano anual.
            // Uma exceção específica do plano tem precedência sobre este padrão.
            if((int)($op['duracao_meses']??0)===12 && !$serviceOverride){
                $fixed=VendaMoney::cents((string)($policy['atendente_um_ano_valor']??'60.00'),true);
                if($fixed===null)throw new \InvalidArgumentException('Valor do atendimento anual inválido.');
                $total=$fixed;
                $notes[]='Atendimento do plano de 12 meses: valor padrão de '.VendaMoney::decimal($total).'.';
            }
            $total=self::customAmount($serviceOverride,$table,$total);
            if($serviceOverride)$notes[]='Atendimento: exceção configurada para esta versão do plano e forma de pagamento.';
            if($payment==='AVISTA'){
                $bonus=VendaMoney::cents((string)($policy['adicional_atendente_avista']??'0.00'),true);
                if($bonus===null)throw new \InvalidArgumentException('Adicional à vista inválido.');
                $total+=$bonus;
                if($bonus>0)$notes[]='Adicional à vista para atendimento: '.VendaMoney::decimal($bonus).'.';
            }
            if($total>$available)return ['rateios'=>[],'avisos'=>['Comissão insuficiente para pagar atendimento: revisar manualmente.']];
            foreach($receivers as $index=>$to){
                $value=$index===count($receivers)-1
                    ?$total-intdiv($total,count($receivers))*(count($receivers)-1)
                    :intdiv($total,count($receivers));
                if($value>0)$out[]=['origem'=>$root,'destino'=>$to,'papel'=>'ATENDENTE','valor'=>$value];
            }
            $available-=$total;
        }
        $manager=(int)($op['gerente_pessoa_id']??0);
        // Sem gerente vinculado, não se inventa pagamento.
        // Gerência cadastrada recebe percentual da tabela também em dia útil.
        // A exceção histórica de renovação com outro corretor permanece vigente.
        if($manager>0 && $manager!==$root && !$renewalOther){
            $value=self::customAmount($managerOverride,$table,self::fraction($table,$managerRate));
            if($managerOverride)$notes[]='Gerente: exceção configurada para esta versão do plano e forma de pagamento.';
            if($value>$available)return ['rateios'=>[],'avisos'=>['Comissão insuficiente para pagar gerente: revisar manualmente.']];
            if($value>0)$out[]=['origem'=>$root,'destino'=>$manager,'papel'=>'GERENTE','valor'=>$value];
            $available-=$value;
        }
        $second=(int)($op['segundo_corretor_pessoa_id']??0);
        if($second>0 && $second!==$root){
            $value=self::fraction($available,$secondRate);
            if($value>0)$out[]=['origem'=>$root,'destino'=>$second,'papel'=>'CORRETOR','valor'=>$value];
        }
        if($businessDay)$notes[]='Atendimento de dia útil, sujeito à conferência de feriados cadastrados.';
        if($manager>0 && $manager!==$root && !$renewalOther)$notes[]='Gerência incluída conforme cadastro da venda.';
        $notes[]='Rateio automático é uma apuração; não registra pagamentos.';
        RateioRules::balances($root,$base,$out);
        return ['rateios'=>$out,'avisos'=>$notes];
    }

    /**
     * Chamar dentro da transação que bloqueou venda_operacoes FOR UPDATE.
     * Não deixa valores automaticamente criados sem registro de auditoria.
     */
    public static function sync($db,int $id,?int $userId=null): array
    {
        $op=$db->table('venda_operacoes')->where('id',$id)->get()->getRowArray();
        if(!$op || $op['situacao']!=='VENDA')return ['status'=>'AGUARDANDO'];
        if($db->table('comissao_auto_apuracoes')->where('operacao_id',$id)->countAllResults()>0){
            return ['status'=>'JA_APURADA'];
        }
        if($db->table('comissao_rateios')->where('operacao_id',$id)->countAllResults()>0){
            return ['status'=>'RATEIO_MANUAL'];
        }
        $total=VendaMoney::cents((string)$op['valor_cobrado']);
        $received=0;
        foreach($db->table('venda_recebimentos')->select('tipo,valor')->where('operacao_id',$id)->get()->getResultArray() as $move){
            $v=VendaMoney::cents((string)$move['valor']);
            $received+=$move['tipo']==='ENTRADA'?$v:-$v;
        }
        if($received!==$total || ($op['comissao_ajustada']??$op['comissao_prevista'])===null){
            return ['status'=>'AGUARDANDO_PAGAMENTO'];
        }
        $policy=$db->table('comissao_politicas')->where('id',1)->get()->getRowArray();
        if(!$policy)throw new \RuntimeException('Configuração de comissões não encontrada.');
        $holiday=$db->table('comissao_feriados')->where('data',$op['data_venda'])->countAllResults()>0;
        $op['_regras_especiais']=$db->table('comissao_excecoes_plano')
            ->where('plano_versao_id',(int)$op['plano_versao_id'])->get()->getResultArray();
        $planVersion=$db->table('plano_versoes')
            ->select('duracao_meses')->where('id',(int)$op['plano_versao_id'])->get()->getRowArray();
        $op['duracao_meses']=(int)($planVersion['duracao_meses']??0);
        $renewalOther=false;
        if($op['segundo_corretor_pessoa_id']){
            $cliente=$db->table('clientes c')->select('o.nome AS origem_nome')
                ->join('lead_origens o','o.id=c.origem_id','left')
                ->where('c.id',$op['cliente_id'])->get()->getRowArray();
            $renewalOther=mb_stripos((string)($cliente['origem_nome']??''),'renova')!==false;
        }
        try{
            $plan=self::propose($op,$policy,$holiday,$renewalOther);
        }catch(\InvalidArgumentException $e){
            $plan=['rateios'=>[],'avisos'=>[$e->getMessage()]];
        }
        $notes=$plan['avisos'];
        $status='GERADO';
        if(!$plan['rateios'] && count($notes)===1 && !str_contains($notes[0],'não registra pagamentos'))$status='REVISAR';
        // Validate participant roles before inserting. Missing roles require manual review.
        if($status==='GERADO'){
            foreach($plan['rateios'] as $row){
                $expected=match($row['papel']){
                    'CORRETOR'=>['corretor'],
                    'ATENDENTE'=>['vendedor','corretor'],
                    'GERENTE'=>['gerente'],
                    default=>[],
                };
                $roles=$db->table('pessoa_papeis')->select('papel')->where('pessoa_id',$row['destino'])->get()->getResultArray();
                if(!array_intersect($expected,array_column($roles,'papel'))){
                    $status='REVISAR';
                    $notes[]='Participante sem função cadastrada: pessoa #'.$row['destino'];
                    break;
                }
            }
        }
        if($status==='REVISAR')$plan['rateios']=[];
        $now=\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
        foreach($plan['rateios'] as $row){
            $db->table('comissao_rateios')->insert([
                'operacao_id'=>$id,'responsavel_pessoa_id'=>$row['origem'],
                'beneficiario_pessoa_id'=>$row['destino'],'papel'=>$row['papel'],
                'valor'=>VendaMoney::decimal($row['valor']),
                'observacoes'=>'Gerado automaticamente; pode ser ajustado antes de qualquer repasse.',
                'criado_por_usuario_id'=>$userId??(int)$op['criado_por_usuario_id'],
                'criado_em'=>$now,
            ]);
        }
        $db->table('comissao_auto_apuracoes')->insert([
            'operacao_id'=>$id,'status'=>$status,
            'observacoes'=>mb_substr(implode(' ',$notes),0,700),
            'gerado_em'=>$now,'gerado_por_usuario_id'=>$userId,
        ]);
        $db->table('comissao_rateios_auditoria')->insert([
            'operacao_id'=>$id,'dados_antes'=>'[]',
            'dados_depois'=>json_encode($plan['rateios'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'justificativa'=>'Apuração automática na quitação, conforme os participantes da venda.',
            'usuario_id'=>$userId??(int)$op['criado_por_usuario_id'],'criado_em'=>$now,
        ]);
        return ['status'=>$status,'quantidade'=>count($plan['rateios']),'avisos'=>$notes];
    }
}
