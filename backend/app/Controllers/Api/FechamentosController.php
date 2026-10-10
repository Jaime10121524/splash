<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\RateioRules;
use App\Libraries\RateioAutomatico;
use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Apuração/repasse individual. Não efetua pagamentos bancários e NÃO
 * declara um fechamento liquidado; os movimentos representam pagamentos
 * que o administrador confirmou ter realizado.
 */
class FechamentosController extends CommercialBaseController
{
    private function period(): array|ResponseInterface
    {
        $today=new \DateTimeImmutable('now',new \DateTimeZone(config('App')->appTimezone));
        $monday=$today->modify('monday this week');
        $sunday=$monday->modify('+6 days');
        $start=(string)($this->request->getGet('inicio')??$monday->format('Y-m-d'));
        $end=(string)($this->request->getGet('fim')??$sunday->format('Y-m-d'));
        if(!$this->validateDate($start)||!$this->validateDate($end)||$start>$end
            ||(new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days>366){
            return $this->errorResponse(422,'Selecione um período válido de no máximo 366 dias.');
        }
        return [$start,$end];
    }

    private function money($value): ?int
    {
        return VendaMoney::cents($value);
    }

    private function now(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }

    private function commission(array $op): ?int
    {
        $source=$op['comissao_ajustada']??$op['comissao_prevista'];
        return $source===null?null:VendaMoney::cents((string)$source,true);
    }

    private function rows($db,string $start,string $end): array
    {
        $operations=$db->table('venda_operacoes o')
            ->select('o.id,o.numero_titulo,o.sigla_plano,o.data_venda,o.corretor_pessoa_id,o.segundo_corretor_pessoa_id,o.atendente_pessoa_id,o.atendente_adicional_pessoa_id,o.comissao_prevista,o.comissao_ajustada,o.valor_cobrado,o.valor_tabela,o.observacao_comissao,c.nome AS cliente_nome,p.nome AS corretor_nome',false)
            ->join('clientes c','c.id=o.cliente_id')
            ->join('pessoas p','p.id=o.corretor_pessoa_id','left')
            ->where('o.situacao','VENDA')
            ->where('o.data_venda >=',$start)->where('o.data_venda <=',$end)
            ->orderBy('o.data_venda','DESC')->orderBy('o.id','DESC')
            ->limit(500)->get()->getResultArray();
        if(!$operations)return [];
        $ids=array_map(static fn($r)=>(int)$r['id'],$operations);
        $received=[];
        $salesMovements=$db->table('venda_recebimentos')->select('operacao_id,tipo,valor')
            ->whereIn('operacao_id',$ids)->get()->getResultArray();
        foreach($salesMovements as $move){
            $oid=(int)$move['operacao_id'];
            $received[$oid]=($received[$oid]??0)+
                ($move['tipo']==='ENTRADA'?1:-1)*VendaMoney::cents((string)$move['valor'],true);
        }
        $allocations=$db->table('comissao_rateios r')
            ->select('r.*,b.nome AS beneficiario_nome,o.nome AS origem_nome')
            ->join('pessoas b','b.id=r.beneficiario_pessoa_id')
            ->join('pessoas o','o.id=r.responsavel_pessoa_id')
            ->whereIn('r.operacao_id',$ids)->orderBy('r.id','ASC')->get()->getResultArray();
        $allocationIds=array_map(static fn($r)=>(int)$r['id'],$allocations);
        $paid=[];
        if($allocationIds){
            $movements=$db->table('comissao_repasses')
                ->select('id,rateio_id,tipo,valor,referencia_pagamento_id,data_pagamento,observacoes')
                ->whereIn('rateio_id',$allocationIds)->orderBy('id','ASC')->get()->getResultArray();
            foreach($movements as $movement){
                $rid=(int)$movement['rateio_id'];
                $paid[$rid]=($paid[$rid]??0)+($movement['tipo']==='PAGAMENTO'?1:-1)
                    * VendaMoney::cents((string)$movement['valor'],true);
            }
        }
        $autoMap=[];
        foreach($db->table('comissao_auto_apuracoes')->select('operacao_id,status,observacoes')
            ->whereIn('operacao_id',$ids)->get()->getResultArray() as $record){
            $autoMap[(int)$record['operacao_id']]=$record;
        }
        $byOperation=[];
        foreach($allocations as $a){
            $id=(int)$a['id'];
            $amount=VendaMoney::cents((string)$a['valor']);
            $a['id']=$id;$a['operacao_id']=(int)$a['operacao_id'];
            $a['responsavel_pessoa_id']=(int)$a['responsavel_pessoa_id'];
            $a['beneficiario_pessoa_id']=(int)$a['beneficiario_pessoa_id'];
            $a['pago']=VendaMoney::decimal($paid[$id]??0);
            $a['pendente']=VendaMoney::decimal($amount-($paid[$id]??0));
            $byOperation[$a['operacao_id']][]=$a;
        }
        foreach($operations as &$operation){
            $operation['id']=(int)$operation['id'];
            foreach(['corretor_pessoa_id','segundo_corretor_pessoa_id','atendente_pessoa_id','atendente_adicional_pessoa_id'] as $key){
                $operation[$key]=$operation[$key]===null?null:(int)$operation[$key];
            }
            $operation['rateios']=$byOperation[$operation['id']]??[];
            $operation['apuracao_automatica']=$autoMap[$operation['id']]??null;
            $fullyPaid=($received[$operation['id']]??0)===VendaMoney::cents((string)$operation['valor_cobrado']);
            $commission=$fullyPaid?$this->commission($operation):null;
            $operation['comissao_base']=$commission===null?null:VendaMoney::decimal($commission);
            $operation['pendente_apuracao']=$commission===null;
            $out=$in=0;
            foreach($operation['rateios'] as $allocation){
                $v=VendaMoney::cents((string)$allocation['valor']);
                if($allocation['responsavel_pessoa_id']===$operation['corretor_pessoa_id'])$out+=$v;
                if($allocation['beneficiario_pessoa_id']===$operation['corretor_pessoa_id'])$in+=$v;
            }
            $operation['saldo_corretor_base']=$commission===null?null:VendaMoney::decimal($commission-$out+$in);
        }
        unset($operation);
        return $operations;
    }

    public function resumo(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $range=$this->period();
        if($range instanceof ResponseInterface)return $range;
        [$start,$end]=$range;
        $db=db_connect();
        $operations=$this->rows($db,$start,$end);
        $people=$db->table('pessoas')->select('id,nome,ativo')
            ->orderBy('nome','ASC')->get()->getResultArray();
        $rates=[];
        foreach($operations as $op){
            if($op['comissao_base']===null)continue;
            $root=$op['corretor_pessoa_id'];
            $rates[$root]??=['id'=>$root,'nome'=>$op['corretor_nome'],'comissoes'=>0,'saidas'=>0,'entradas'=>0,'repasses_pagos'=>0,'repasses_pendentes'=>0];
            $rates[$root]['comissoes']+=VendaMoney::cents($op['comissao_base'],true);
            foreach($op['rateios'] as $a){
                $from=$a['responsavel_pessoa_id'];$to=$a['beneficiario_pessoa_id'];
                foreach([[$from,'saidas',$a['origem_nome']],[$to,'entradas',$a['beneficiario_nome']]] as [$pid,$field,$name]){
                    $rates[$pid]??=['id'=>$pid,'nome'=>$name,'comissoes'=>0,'saidas'=>0,'entradas'=>0,'repasses_pagos'=>0,'repasses_pendentes'=>0];
                    $rates[$pid][$field]+=VendaMoney::cents((string)$a['valor']);
                }
                $rates[$to]['repasses_pagos']+=VendaMoney::cents((string)$a['pago'],true);
                $rates[$to]['repasses_pendentes']+=VendaMoney::cents((string)$a['pendente'],true);
            }
        }
        foreach($rates as &$p){
            $p['saldo_proprio']=VendaMoney::decimal($p['comissoes']-$p['saidas']+$p['entradas']);
            foreach(['comissoes','saidas','entradas','repasses_pagos','repasses_pendentes'] as $key)$p[$key]=VendaMoney::decimal($p[$key]);
        }
        unset($p);
        return $this->response->setJSON([
            'inicio'=>$start,'fim'=>$end,'operacoes'=>$operations,'pessoas'=>$people,
            'saldos'=>array_values($rates),'limite_operacoes'=>500,
            'aviso'=>'Apuração de comissões. Recebimentos do clube, gastos, empréstimos e pagamentos do corretor principal ainda serão conciliados no fechamento definitivo.',
        ])->setHeader('Cache-Control','no-store');
    }

    public function meu(): ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user||$user->isBanned())return $this->errorResponse(401,'Faça login novamente.');
        $range=$this->period();
        if($range instanceof ResponseInterface)return $range;
        [$start,$end]=$range;
        $db=db_connect();
        $self=$db->table('pessoas')->select('id,nome')
            ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
        if(!$self)return $this->errorResponse(403,'Nenhuma pessoa ativa está vinculada ao seu usuário.');
        $id=(int)$self['id'];
        $operations=$this->rows($db,$start,$end);
        $mine=0;$fromOthers=0;$outgoing=0;$paidToMe=0;$openToMe=0;
        foreach($operations as $op){
            if($op['comissao_base']===null)continue;
            if($op['corretor_pessoa_id']===$id)$mine+=VendaMoney::cents($op['comissao_base'],true);
            foreach($op['rateios'] as $allocation){
                $amount=VendaMoney::cents((string)$allocation['valor']);
                if($allocation['responsavel_pessoa_id']===$id)$outgoing+=$amount;
                if($allocation['beneficiario_pessoa_id']===$id){
                    $fromOthers+=$amount;
                    $paidToMe+=VendaMoney::cents((string)$allocation['pago'],true);
                    $openToMe+=VendaMoney::cents((string)$allocation['pendente'],true);
                }
            }
        }
        return $this->response->setJSON([
            'inicio'=>$start,'fim'=>$end,
            'pessoa'=>['id'=>$id,'nome'=>$self['nome']],
            'resumo'=>[
                'comissoes_proprias'=>VendaMoney::decimal($mine),
                'obrigacoes_de_rateio'=>VendaMoney::decimal($outgoing),
                'direitos_de_terceiros'=>VendaMoney::decimal($fromOthers),
                'rateios_ja_pagos_a_mim'=>VendaMoney::decimal($paidToMe),
                'rateios_pendentes_para_mim'=>VendaMoney::decimal($openToMe),
                'participacao_liquida_prevista'=>VendaMoney::decimal($mine-$outgoing+$fromOthers),
            ],
            'aviso'=>'Valores apurados individualmente. Não incluem despesas, empréstimos, acertos com a empresa nem fechamento liquidado.',
        ])->setHeader('Cache-Control','no-store');
    }

    public function sincronizar(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $body=$this->jsonPayload();
        $start=(string)($body['inicio']??'');
        $end=(string)($body['fim']??'');
        if(!$this->validateDate($start)||!$this->validateDate($end)||$start>$end
            ||(new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days>366){
            return $this->errorResponse(422,'Informe um período válido de no máximo 366 dias.');
        }
        $db=db_connect();
        $ids=$db->table('venda_operacoes')
            ->select('id')->where('situacao','VENDA')
            ->where('data_venda >=',$start)->where('data_venda <=',$end)
            ->orderBy('id','ASC')->limit(500)->get()->getResultArray();
        $counts=['geradas'=>0,'revisar'=>0,'existentes'=>0,'aguardando'=>0];
        foreach($ids as $item){
            $id=(int)$item['id'];
            $db->transBegin();
            try{
                $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[$id])->getRowArray();
                $result=RateioAutomatico::sync($db,$id,(int)auth('session')->user()->id);
                $status=$result['status'];
                $key=match($status){
                    'GERADO'=>'geradas','REVISAR'=>'revisar',
                    'JA_APURADA','RATEIO_MANUAL'=>'existentes',
                    default=>'aguardando',
                };
                $counts[$key]++;
                $this->commitOrFail($db);
            }catch(Throwable $e){
                $db->transRollback();
                return $this->unexpected($e,'sincronizar rateios automáticos');
            }
        }
        return $this->responseOK('Apuração automática concluída.',200,
            ['resultado'=>$counts,'total_consultado'=>count($ids),'limite'=>500]);
    }

    public function politica(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $db=db_connect();
        return $this->response->setJSON([
            'politica'=>$db->table('comissao_politicas')->where('id',1)->get()->getRowArray(),
            'feriados'=>$db->table('comissao_feriados')->orderBy('data','DESC')->limit(100)->get()->getResultArray(),
        ])->setHeader('Cache-Control','no-store');
    }

    public function salvarPolitica(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $payload=$this->jsonPayload();
        $keys=['percentual_atendente_dia_util','percentual_atendente_outros_dias','percentual_gerente','divisao_segundo_corretor'];
        $values=[];
        foreach($keys as $key){
            $raw=(string)($payload[$key]??'');
            if(!preg_match('/^(?:\d{1,2}|100)(?:\.\d{1,2})?$/D',$raw)|| (float)$raw>100){
                return $this->errorResponse(422,'Percentual inválido em '.$key.'. Informe 0 a 100, com até duas casas.');
            }
            $values[$key]=$raw;
        }
        $db=db_connect();$db->transBegin();
        try{
            $db->table('comissao_politicas')->where('id',1)->update([
                ...$values,
                'alterado_em'=>\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Parâmetros salvos. Somente próximas apurações os utilizarão.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'atualizar políticas de comissão');
        }
    }

    public function salvarFeriado(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $payload=$this->jsonPayload();
        $date=(string)($payload['data']??'');
        $desc=$this->cleanText($payload['descricao']??null,120,true);
        if(!$this->validateDate($date) || $desc===false){
            return $this->errorResponse(422,'Informe a data e o motivo do feriado.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $row=$db->table('comissao_feriados')->where('data',$date)->get()->getRowArray();
            if($row)$db->table('comissao_feriados')->where('data',$date)->update(['descricao'=>$desc]);
            else $db->table('comissao_feriados')->insert(['data'=>$date,'descricao'=>$desc]);
            $this->commitOrFail($db);
            return $this->responseOK('Feriado cadastrado para próximas apurações.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'salvar feriado');
        }
    }

    public function ratear(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $input=$this->jsonPayload();
        $items=$input['itens']??null;
        $reason=$this->cleanText($input['justificativa']??null,500,true);
        if(!is_array($items)||count($items)>30||$reason===false||mb_strlen($reason)<5){
            return $this->errorResponse(422,'Informe até 30 participações e uma justificativa de ao menos cinco caracteres.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$op||$op['situacao']!=='VENDA'||$this->commission($op)===null
                ||!$this->salePaid($db,$op)){
                $db->transRollback();
                return $this->errorResponse(409,'Só é possível ratear uma venda com comissão calculada ou ajustada.');
            }
            $old=$db->table('comissao_rateios')->where('operacao_id',(int)$id)->orderBy('id','ASC')->get()->getResultArray();
            if($old){
                $oldIds=array_column($old,'id');
                if($db->table('comissao_repasses')->whereIn('rateio_id',$oldIds)->countAllResults()){
                    $db->transRollback();
                    return $this->errorResponse(409,'Rateios com histórico de pagamentos ou estornos não podem ser substituídos. Faça um ajuste complementar no futuro fechamento.');
                }
            }
            $clean=[];$ids=[];
            foreach($items as $item){
                if(!is_array($item)){
                    $db->transRollback();return $this->errorResponse(422,'Item de rateio inválido.');
                }
                $from=$this->optionalId($item['responsavel_pessoa_id']??null);
                $to=$this->optionalId($item['beneficiario_pessoa_id']??null);
                $value=$this->money($item['valor']??null);
                $role=(string)($item['papel']??'');
                $note=$this->cleanText($item['observacoes']??null,500);
                if(!$from||!$to||$value===null||$note===false){
                    $db->transRollback();return $this->errorResponse(422,'Corrija pessoa responsável, beneficiário e valor.');
                }
                $ids[$from]=true;$ids[$to]=true;
                $clean[]=[
                    'responsavel_pessoa_id'=>$from,'beneficiario_pessoa_id'=>$to,
                    'papel'=>$role,'valor'=>VendaMoney::decimal($value),'observacoes'=>$note,
                ];
            }
            $people=$ids?$db->table('pessoas')->select('id')->whereIn('id',array_keys($ids))->get()->getResultArray():[];
            if(count($people)!==count($ids)){
                $db->transRollback();
                return $this->errorResponse(422,'Uma das pessoas não está cadastrada.');
            }
            $roles=[];
            if($ids){
                foreach($db->table('pessoa_papeis')->select('pessoa_id,papel')
                    ->whereIn('pessoa_id',array_keys($ids))->get()->getResultArray() as $r){
                    $roles[(int)$r['pessoa_id']][]=$r['papel'];
                }
            }
            foreach($clean as $item){
                $allowed=match($item['papel']){
                    'CORRETOR'=>['corretor'],
                    'ATENDENTE'=>['corretor','vendedor'],
                    'GERENTE'=>['gerente'],
                    default=>[],
                };
                if(!array_intersect($allowed,$roles[$item['beneficiario_pessoa_id']]??[])){
                    $db->transRollback();
                    return $this->errorResponse(422,'O beneficiário precisa ter a função correspondente cadastrada em Pessoas.');
                }
            }
            $graph=array_map(static fn($a)=>[
                'origem'=>$a['responsavel_pessoa_id'],'destino'=>$a['beneficiario_pessoa_id'],
                'valor'=>VendaMoney::cents($a['valor']),'papel'=>$a['papel'],
            ],$clean);
            try {
                RateioRules::balances((int)$op['corretor_pessoa_id'],$this->commission($op),$graph);
            }catch(\InvalidArgumentException $e){
                $db->transRollback();
                return $this->errorResponse(422,$e->getMessage());
            }
            $db->table('comissao_rateios')->where('operacao_id',(int)$id)->delete();
            $now=$this->now();
            foreach($clean as $item){
                $db->table('comissao_rateios')->insert([
                    'operacao_id'=>(int)$id,...$item,
                    'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                    'criado_em'=>$now,
                ]);
            }
            $db->table('comissao_auto_apuracoes')->where('operacao_id',(int)$id)
                ->update(['status'=>'MANUAL','observacoes'=>'Rateio conferido e personalizado pelo administrador.']);
            $db->table('comissao_rateios_auditoria')->insert([
                'operacao_id'=>(int)$id,
                'dados_antes'=>json_encode($old,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                'dados_depois'=>json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                'justificativa'=>$reason,'usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$now,
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Participações apuradas e registradas; nenhum pagamento foi realizado.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'ratear comissão');
        }
    }

    public function pagar(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $input=$this->jsonPayload();
        $value=$this->money($input['valor']??null);
        $date=$input['data_pagamento']??null;
        $note=$this->cleanText($input['observacoes']??null,500);
        if($value===null||!$this->validateDate($date,false)||$note===false){
            return $this->errorResponse(422,'Informe valor, data e observações válidos.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $allocation=$db->query('SELECT r.*,o.corretor_pessoa_id,o.comissao_prevista,o.comissao_ajustada
                FROM comissao_rateios r JOIN venda_operacoes o ON o.id=r.operacao_id
                WHERE r.id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$allocation){
                $db->transRollback();return $this->errorResponse(404,'Participação não encontrada.');
            }
            $paid=$this->sumPaid($db,(int)$id);
            $total=VendaMoney::cents((string)$allocation['valor']);
            if($value>$total-$paid){
                $db->transRollback();return $this->errorResponse(422,'Pagamento supera o saldo ainda devido ao participante.');
            }
            $db->table('comissao_repasses')->insert([
                'rateio_id'=>(int)$id,'tipo'=>'PAGAMENTO','referencia_pagamento_id'=>null,
                'valor'=>VendaMoney::decimal($value),'data_pagamento'=>$date,
                'observacoes'=>$note,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Repasse manual registrado na conta da pessoa beneficiária.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'registrar pagamento de participação');
        }
    }

    public function estornar(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $input=$this->jsonPayload();
        $reason=$this->cleanText($input['justificativa']??null,500,true);
        if($reason===false||mb_strlen($reason)<5){
            return $this->errorResponse(422,'Informe o motivo do estorno (mínimo cinco caracteres).');
        }
        $db=db_connect();$db->transBegin();
        try{
            $pay=$db->query('SELECT m.* FROM comissao_repasses m
                JOIN comissao_rateios r ON r.id=m.rateio_id
                JOIN venda_operacoes o ON o.id=r.operacao_id
                WHERE m.id=? AND m.tipo=? FOR UPDATE',[(int)$id,'PAGAMENTO'])->getRowArray();
            if(!$pay){
                $db->transRollback();return $this->errorResponse(404,'Repasse não encontrado.');
            }
            if($db->table('comissao_repasses')->where('referencia_pagamento_id',(int)$id)->countAllResults()>0){
                $db->transRollback();return $this->errorResponse(409,'Esse pagamento já foi estornado.');
            }
            $db->table('comissao_repasses')->insert([
                'rateio_id'=>(int)$pay['rateio_id'],'tipo'=>'ESTORNO',
                'referencia_pagamento_id'=>(int)$id,
                'valor'=>$pay['valor'],'data_pagamento'=>substr($this->now(),0,10),
                'observacoes'=>$reason,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Repasse estornado no histórico. Isso não executa transferência bancária.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'estornar repasse');
        }
    }

    private function salePaid($db,array $operation): bool
    {
        $movements=$db->table('venda_recebimentos')->select('tipo,valor')
            ->where('operacao_id',(int)$operation['id'])->get()->getResultArray();
        $net=0;
        foreach($movements as $move){
            $value=VendaMoney::cents((string)$move['valor'],true);
            $net+=$move['tipo']==='ENTRADA'?$value:-$value;
        }
        return $net===VendaMoney::cents((string)$operation['valor_cobrado']);
    }

    private function sumPaid($db,int $id): int
    {
        $movements=$db->table('comissao_repasses')->select('tipo,valor')
            ->where('rateio_id',$id)->get()->getResultArray();
        $sum=0;
        foreach($movements as $item){
            $value=VendaMoney::cents((string)$item['valor']);
            $sum+=$item['tipo']==='PAGAMENTO'?$value:-$value;
        }
        return $sum;
    }

    public function extrato(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $db=db_connect();
        $allocation=$db->table('comissao_rateios r')
            ->select('r.*,a.nome AS responsavel_nome,b.nome AS beneficiario_nome')
            ->join('pessoas a','a.id=r.responsavel_pessoa_id')
            ->join('pessoas b','b.id=r.beneficiario_pessoa_id')
            ->where('r.id',(int)$id)->get()->getRowArray();
        if(!$allocation)return $this->errorResponse(404,'Participação não encontrada.');
        $moves=$db->table('comissao_repasses')->where('rateio_id',(int)$id)
            ->orderBy('id','DESC')->get()->getResultArray();
        return $this->response->setJSON(['rateio'=>$allocation,'movimentos'=>$moves,
            'pago'=>VendaMoney::decimal($this->sumPaid($db,(int)$id))])
            ->setHeader('Cache-Control','no-store');
    }
}
