<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\RateioRules;
use App\Libraries\RateioAutomatico;
use App\Libraries\VendaMoney;
use App\Libraries\SaldoComissao;
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
            ->select('o.id,o.visita_id,o.numero_titulo,o.sigla_plano,o.data_venda,o.corretor_pessoa_id,o.segundo_corretor_pessoa_id,o.atendente_pessoa_id,o.atendente_adicional_pessoa_id,o.comissao_prevista,o.comissao_ajustada,o.valor_cobrado,o.valor_tabela,o.observacao_comissao,c.nome AS cliente_nome,p.nome AS corretor_nome',false)
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


    /**
     * Extrato consolidado por pessoa: direitos a receber, recebidos e pendentes.
     * O titular recebe apenas sua parcela após os rateios. Cada beneficiário
     * vê suas participações e repasses; sem acesso a nomes de clientes.
     */
    private function contasPorPessoa($db,array $operations,bool $admin,?int $onlyPersonId=null): array
    {
        if(!$operations)return [];
        $ids=array_column($operations,'id');
        $ownerMovements=$db->table('comissao_titular_movimentos')
            ->select('id,operacao_id,corretor_pessoa_id,tipo,valor,data_pagamento,observacoes,referencia_pagamento_id')
            ->whereIn('operacao_id',$ids)->orderBy('id','ASC')->get()->getResultArray();
        $ownerByOperation=[];
        foreach($ownerMovements as $m){
            $key=(int)$m['operacao_id'];
            $ownerByOperation[$key]['saldo']=($ownerByOperation[$key]['saldo']??0)
                +($m['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$m['valor']);
            $ownerByOperation[$key]['movimentos'][]=$m;
        }
        $allocIds=[];
        foreach($operations as $op)foreach($op['rateios'] as $a)$allocIds[]=(int)$a['id'];
        $history=[];
        if($allocIds){
            foreach($db->table('comissao_repasses')
                ->select('id,rateio_id,tipo,valor,data_pagamento,observacoes,referencia_pagamento_id')
                ->whereIn('rateio_id',$allocIds)->orderBy('id','ASC')->get()->getResultArray() as $m){
                $history[(int)$m['rateio_id']][]=$m;
            }
        }
        $accounts=[];
        $personName=[];
        if($admin){
            foreach($db->table('pessoas')->select('id,nome')->get()->getResultArray() as $p){
                $personName[(int)$p['id']]=$p['nome'];
            }
        }
        $add=function(int $personId,string $name,array $line) use(&$accounts,$onlyPersonId,$admin,$personName){
            if($onlyPersonId!==null && $personId!==$onlyPersonId)return;
            $accounts[$personId]??=[
                'pessoa_id'=>$personId,
                'nome'=>$admin?($personName[$personId]??$name):$name,
                'total_centavos'=>0,'pago_centavos'=>0,
                'obrigações_centavos'=>0,'obrigações_pagas_centavos'=>0,
                'itens'=>[],
            ];
            $accounts[$personId]['total_centavos']+=$line['total_centavos'];
            $accounts[$personId]['pago_centavos']+=$line['pago_centavos'];
            $accounts[$personId]['itens'][]=$line;
        };
        foreach($operations as $op){
            if($op['comissao_base']===null)continue;
            // Sem apuração concluída, não atribuir toda a comissão ao corretor
            // quando atendente, gerente ou segundo corretor podem ter participação.
            $approval=$op['apuracao_automatica']['status']??null;
            if(($approval===null || $approval==='REVISAR') && !$op['rateios'])continue;
            $root=(int)$op['corretor_pessoa_id'];
            $base=VendaMoney::cents((string)$op['comissao_base']);
            $rootTransfer=0;
            foreach($op['rateios'] as $a){
                if((int)$a['responsavel_pessoa_id']===$root)$rootTransfer+=VendaMoney::cents((string)$a['valor']);
            }
            $rootTotal=SaldoComissao::titular($base,$rootTransfer);
            $key=(int)$op['id'];
            $paidOwner=$ownerByOperation[$key]['saldo']??0;
            $sourceLabel='Corretor principal — parte própria';
            $meta=[
                'operacao_id'=>$key,
                'visita_id'=>$op['visita_id']===null?null:(int)$op['visita_id'],
                'data_venda'=>$op['data_venda'],
                'titulo'=>trim((string)($op['numero_titulo']??'').' '.(string)($op['sigla_plano']??'')),
                // Nenhum nome, telefone ou CPF de associado para não administrador.
                'cliente_nome'=>$admin?$op['cliente_nome']:null,
            ];
            $add($root,(string)($op['corretor_nome']??'Corretor'),[
                ...$meta,'tipo'=>'TITULAR','rateio_id'=>null,
                'descricao'=>$sourceLabel,'pagador'=>'Clube / acerto do responsável',
                'total_centavos'=>$rootTotal,'pago_centavos'=>$paidOwner,
                'movimentos'=>array_map(static function($m) use($admin){ return [
                    'id'=>(int)$m['id'],'tipo'=>$m['tipo'],
                    'valor'=>$m['valor'],'data'=>$m['data_pagamento'],
                    'observacoes'=>$admin?$m['observacoes']:null,
                    'referencia_pagamento_id'=>$m['referencia_pagamento_id']===null?null:(int)$m['referencia_pagamento_id'],
                ]; },$ownerByOperation[$key]['movimentos']??[]),
            ]);
            foreach($op['rateios'] as $a){
                $payee=(int)$a['beneficiario_pessoa_id'];
                $paid=VendaMoney::cents((string)$a['pago'],true);
                $outstanding=VendaMoney::cents((string)$a['valor']);
                $add($payee,$admin?$a['beneficiario_nome']:'Sua conta',[
                    ...$meta,'tipo'=>'PARTICIPACAO',
                    'rateio_id'=>(int)$a['id'],
                    'descricao'=>match($a['papel']){
                        'ATENDENTE'=>'Atendimento','CORRETOR'=>'Divisão com corretor',
                        'GERENTE'=>'Gerência',default=>'Participação',
                    },
                    'pagador'=>$admin?$a['origem_nome']:'Corretor responsável',
                    'total_centavos'=>$outstanding,'pago_centavos'=>$paid,
                    'movimentos'=>array_map(static function($m) use($admin){ return [
                        'id'=>(int)$m['id'],'tipo'=>$m['tipo'],
                        'valor'=>$m['valor'],'data'=>$m['data_pagamento'],
                        'observacoes'=>$admin?$m['observacoes']:null,
                        'referencia_pagamento_id'=>$m['referencia_pagamento_id']===null?null:(int)$m['referencia_pagamento_id'],
                    ]; },$history[(int)$a['id']]??[]),
                ]);
                if($onlyPersonId===null || (int)$a['responsavel_pessoa_id']===$onlyPersonId){
                    $payer=(int)$a['responsavel_pessoa_id'];
                    $accounts[$payer]??=[
                        'pessoa_id'=>$payer,
                        'nome'=>$admin?($personName[$payer]??$a['origem_nome']):'Sua conta',
                        'total_centavos'=>0,'pago_centavos'=>0,
                        'obrigações_centavos'=>0,'obrigações_pagas_centavos'=>0,'itens'=>[],
                    ];
                    $accounts[$payer]['obrigações_centavos']+=$outstanding;
                    $accounts[$payer]['obrigações_pagas_centavos']+=$paid;
                }
            }
        }
        $result=[];
        foreach($accounts as $account){
            foreach($account['itens'] as &$line){
                $balance=SaldoComissao::resumo($line['total_centavos'],$line['pago_centavos']);
                $line['total']=$balance['total'];
                $line['pago']=$balance['pago'];
                $line['pendente']=$balance['pendente'];
                unset($line['total_centavos'],$line['pago_centavos']);
            }
            unset($line);
            $due=$account['total_centavos'];
            $paid=$account['pago_centavos'];
            $account['resumo']=[
                'total'=>VendaMoney::decimal($due),
                'pago'=>VendaMoney::decimal($paid),
                'pendente'=>VendaMoney::decimal(max(0,$due-$paid)),
                'a_repassar'=>VendaMoney::decimal($account['obrigações_centavos']),
                'repasses_ja_pagos'=>VendaMoney::decimal($account['obrigações_pagas_centavos']),
                'repasses_pendentes'=>VendaMoney::decimal(max(0,
                    $account['obrigações_centavos']-$account['obrigações_pagas_centavos'])),
            ];
            unset($account['total_centavos'],$account['pago_centavos'],
                $account['obrigações_centavos'],$account['obrigações_pagas_centavos']);
            // Conta individual não recebe sequer no JSON os valores que deve
            // repassar a terceiros; mostra somente o líquido que lhe pertence.
            if(!$admin){
                unset($account['resumo']['a_repassar'],
                    $account['resumo']['repasses_ja_pagos'],
                    $account['resumo']['repasses_pendentes']);
            }
            usort($account['itens'],static fn($a,$b)=>strcmp($b['data_venda'],$a['data_venda']));
            $result[]=$account;
        }
        usort($result,static fn($a,$b)=>strcmp($a['nome'],$b['nome']));
        return $result;
    }

    public function contas(): ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user||$user->isBanned())return $this->errorResponse(401,'Faça login novamente.');
        $admin=$user->inGroup('admin')&&$user->can('visits.manage');
        $period=$this->period();
        if($period instanceof ResponseInterface)return $period;
        [$start,$end]=$period;
        $db=db_connect();
        $personId=null;
        if(!$admin){
            $person=$db->table('pessoas')->select('id')->where('user_id',(int)$user->id)
                ->where('ativo',1)->get()->getRowArray();
            if(!$person)return $this->errorResponse(403,'Seu usuário não possui pessoa ativa vinculada.');
            $personId=(int)$person['id'];
        }
        else{
            $wanted=$this->request->getGet('pessoa_id');
            if($wanted!==null && $wanted!==''){
                $personId=$this->optionalId($wanted);
                if(!$personId)return $this->errorResponse(422,'Pessoa inválida.');
            }
        }
        $operations=$this->rows($db,$start,$end);
        $accounts=$this->contasPorPessoa($db,$operations,$admin,$personId);
        return $this->response->setJSON([
            'inicio'=>$start,'fim'=>$end,
            'contas'=>$accounts,
            'limite_operacoes'=>500,'possivel_truncamento'=>count($operations)===500,
            'aviso'=>'Somente comissões de vendas quitadas, rateios e pagamentos confirmados. Não inclui adiantamentos não conciliados, despesas, dívidas ou saldo do clube.',
        ])->setHeader('Cache-Control','no-store');
    }

    private function ownerPaid($db,int $id): int
    {
        $movimentos=$db->table('comissao_titular_movimentos')
            ->select('tipo,valor')->where('operacao_id',$id)->get()->getResultArray();
        return SaldoComissao::pago($movimentos);
    }

    private function ownerDue($db,array $op): int
    {
        $amount=$this->commission($op);
        if($amount===null)return 0;
        $distributed=0;
        foreach($db->table('comissao_rateios')
            ->select('valor')->where('operacao_id',(int)$op['id'])
            ->where('responsavel_pessoa_id',(int)$op['corretor_pessoa_id'])->get()->getResultArray() as $r){
            $distributed+=VendaMoney::cents((string)$r['valor'],true);
        }
        return SaldoComissao::titular($amount,$distributed);
    }

    public function pagarTitular(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $input=$this->jsonPayload();
        $value=$this->money($input['valor']??null);
        $date=$input['data_pagamento']??null;
        $reason=$this->cleanText($input['observacoes']??null,500,true);
        if(!$value||!$this->validateDate($date,false)||$reason===false){
            return $this->errorResponse(422,'Valor, data e descrição do pagamento são obrigatórios.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$op||$op['situacao']!=='VENDA'||!$this->salePaid($db,$op)){
                $db->transRollback();
                return $this->errorResponse(409,'Só registre pagamentos de comissão em vendas quitadas.');
            }
            $state=$db->table('comissao_auto_apuracoes')
                ->where('operacao_id',(int)$id)->get()->getRowArray();
            $hasRateios=$db->table('comissao_rateios')->where('operacao_id',(int)$id)->countAllResults()>0;
            if((!$state || $state['status']==='REVISAR') && !$hasRateios){
                $db->transRollback();
                return $this->errorResponse(409,'Confira primeiro o rateio da venda. A parcela própria não pode ser paga antes da apuração.');
            }
            $due=$this->ownerDue($db,$op);
            $paid=$this->ownerPaid($db,(int)$id);
            if($value>$due-$paid || $due<=0){
                $db->transRollback();
                return $this->errorResponse(422,'Pagamento superior à parcela própria ainda pendente do corretor.');
            }
            $db->table('comissao_titular_movimentos')->insert([
                'operacao_id'=>(int)$id,'corretor_pessoa_id'=>(int)$op['corretor_pessoa_id'],
                'tipo'=>'PAGAMENTO','referencia_pagamento_id'=>null,
                'valor'=>VendaMoney::decimal($value),'data_pagamento'=>$date,
                'observacoes'=>$reason,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Pagamento da parcela própria registrado. Nenhuma transferência bancária foi efetuada.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'pagamento de comissão do titular');
        }
    }

    public function estornarTitular(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $reason=$this->cleanText($this->jsonPayload()['justificativa']??null,500,true);
        if($reason===false||mb_strlen($reason)<5)return $this->errorResponse(422,'Justificativa de ao menos cinco caracteres.');
        $db=db_connect();$db->transBegin();
        try{
            $record=$db->table('comissao_titular_movimentos')->where('id',(int)$id)->where('tipo','PAGAMENTO')->get()->getRowArray();
            if(!$record){
                $db->transRollback();return $this->errorResponse(404,'Pagamento não encontrado.');
            }
            $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$record['operacao_id']])->getRowArray();
            if($db->table('comissao_titular_movimentos')->where('referencia_pagamento_id',(int)$id)->countAllResults()>0){
                $db->transRollback();return $this->errorResponse(409,'Pagamento já estornado.');
            }
            $db->table('comissao_titular_movimentos')->insert([
                'operacao_id'=>$record['operacao_id'],'corretor_pessoa_id'=>$record['corretor_pessoa_id'],
                'tipo'=>'ESTORNO','referencia_pagamento_id'=>(int)$id,
                'valor'=>$record['valor'],'data_pagamento'=>substr($this->now(),0,10),
                'observacoes'=>$reason,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Registro do pagamento do corretor estornado, preservando o histórico.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'estorno de pagamento do titular');
        }
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
            if($db->table('comissao_titular_movimentos')->where('operacao_id',(int)$id)->countAllResults()>0){
                $db->transRollback();
                return $this->errorResponse(409,'A parcela do corretor já possui pagamentos/estornos. Não é possível substituir as participações.');
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
            $allocation=$db->table('comissao_rateios')->where('id',(int)$id)->get()->getRowArray();
            if($allocation)$db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$allocation['operacao_id']])->getRowArray();
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
