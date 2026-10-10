<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\RateioRules;
use App\Libraries\RateioAutomatico;
use App\Libraries\ProtecaoVendaFechada;
use App\Libraries\VendaMoney;
use App\Libraries\SaldoComissao;
use App\Libraries\ExtratoPermissoes;
use App\Libraries\DistribuicaoPagamento;
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
    private function contasPorPessoa($db,array $operations,bool $admin,?int $onlyPersonId=null,bool $includeOutgoing=false): array
    {
        if(!$operations)return [];
        $ids=array_column($operations,'id');
        $ownerMovements=$db->table('comissao_titular_movimentos')
            ->select('id,operacao_id,corretor_pessoa_id,tipo,valor,data_pagamento,observacoes,referencia_pagamento_id,forma_id')
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
                ->select('id,rateio_id,tipo,valor,data_pagamento,observacoes,referencia_pagamento_id,forma_id')
                ->whereIn('rateio_id',$allocIds)->orderBy('id','ASC')->get()->getResultArray() as $m){
                $history[(int)$m['rateio_id']][]=$m;
            }
        }
        $paymentMethods=[];$abatMethod=0;
        foreach($db->table('venda_formas_pagamento')->select('id,nome,codigo')->get()->getResultArray() as $method){
            $paymentMethods[(int)$method['id']]=$method['nome'];
            if($method['codigo']==='ABATIMENTO_EMP')$abatMethod=(int)$method['id'];
        }
        $abated=static function(array $moves) use($abatMethod): int {
            $total=0;
            foreach($moves as $m){
                if($abatMethod>0 && (int)($m['forma_id']??0)===$abatMethod){
                    $total+=($m['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$m['valor'],true);
                }
            }
            return $total;
        };
        $accounts=[];
        $personName=[];
        if($admin){
            foreach($db->table('pessoas')->select('id,nome')->get()->getResultArray() as $p){
                $personName[(int)$p['id']]=$p['nome'];
            }
        }
        // O responsável pelo grupo recebe o dinheiro do clube e realiza os
        // pagamentos, inclusive os das vendas de corretores vinculados.
        // A obrigação original permanece associada à venda do corretor.
        $responsaveis=[];
        if($includeOutgoing){
            foreach($db->table('fechamento_responsabilidades')
                ->select('corretor_pessoa_id,responsavel_pessoa_id')->get()->getResultArray() as $rel){
                $responsaveis[(int)$rel['corretor_pessoa_id']]=(int)$rel['responsavel_pessoa_id'];
            }
        }
        $add=function(int $personId,string $name,array $line) use(&$accounts,$onlyPersonId,$admin,$personName){
            if($onlyPersonId!==null && $personId!==$onlyPersonId)return;
            $accounts[$personId]??=[
                'pessoa_id'=>$personId,
                'nome'=>$admin?($personName[$personId]??$name):$name,
                'total_centavos'=>0,'pago_centavos'=>0,'abatido_centavos'=>0,
                'obrigações_centavos'=>0,'obrigações_pagas_centavos'=>0,
                'itens'=>[],'saidas'=>[],
            ];
            $accounts[$personId]['total_centavos']+=$line['total_centavos'];
            $accounts[$personId]['pago_centavos']+=$line['pago_centavos'];
            $accounts[$personId]['abatido_centavos']+=$line['abatido_centavos'];
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
                'abatido_centavos'=>$abated($ownerByOperation[$key]['movimentos']??[]),
                'movimentos'=>array_map(static function($m) use($admin,$paymentMethods){ return [
                    'id'=>(int)$m['id'],'tipo'=>$m['tipo'],
                    'valor'=>$m['valor'],'data'=>$m['data_pagamento'],
                    'observacoes'=>$admin?$m['observacoes']:null,
                    'forma_nome'=>$m['forma_id']?($paymentMethods[(int)$m['forma_id']]??'Não identificada'):'Não informada',
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
                    'abatido_centavos'=>$abated($history[(int)$a['id']]??[]),
                    'movimentos'=>array_map(static function($m) use($admin,$paymentMethods){ return [
                        'id'=>(int)$m['id'],'tipo'=>$m['tipo'],
                        'valor'=>$m['valor'],'data'=>$m['data_pagamento'],
                        'observacoes'=>$admin?$m['observacoes']:null,
                        'forma_nome'=>$m['forma_id']?($paymentMethods[(int)$m['forma_id']]??'Não identificada'):'Não informada',
                        'referencia_pagamento_id'=>$m['referencia_pagamento_id']===null?null:(int)$m['referencia_pagamento_id'],
                    ]; },$history[(int)$a['id']]??[]),
                ]);
                if($onlyPersonId===null || (int)$a['responsavel_pessoa_id']===$onlyPersonId){
                    $payer=(int)$a['responsavel_pessoa_id'];
                    $accounts[$payer]??=[
                        'pessoa_id'=>$payer,
                        'nome'=>$admin?($personName[$payer]??$a['origem_nome']):'Sua conta',
                        'total_centavos'=>0,'pago_centavos'=>0,'abatido_centavos'=>0,
                        'obrigações_centavos'=>0,'obrigações_pagas_centavos'=>0,'itens'=>[],'saidas'=>[],
                    ];
                    $accounts[$payer]['obrigações_centavos']+=$outstanding;
                    $accounts[$payer]['obrigações_pagas_centavos']+=$paid;
                }
                if($includeOutgoing){
                    $titularOperacao=(int)$a['responsavel_pessoa_id'];
                    $pagadorOperacional=$responsaveis[$titularOperacao]??$titularOperacao;
                    if($onlyPersonId===null || $pagadorOperacional===$onlyPersonId){
                        $accounts[$pagadorOperacional]??=[
                            'pessoa_id'=>$pagadorOperacional,
                            'nome'=>$admin?($personName[$pagadorOperacional]??'Responsável'):'Minha conta',
                            'total_centavos'=>0,'pago_centavos'=>0,'abatido_centavos'=>0,
                            'obrigações_centavos'=>0,'obrigações_pagas_centavos'=>0,
                            'itens'=>[],'saidas'=>[],
                        ];
                        $accounts[$pagadorOperacional]['saidas'][]=[
                            'id'=>(int)$a['id'],'beneficiario_pessoa_id'=>$payee,
                            'beneficiario_nome'=>$a['beneficiario_nome'],
                            'papel'=>$a['papel'],'data_venda'=>$op['data_venda'],
                            'origem_corretor_nome'=>$op['corretor_nome']??'Corretor',
                            'titulo'=>$meta['titulo'],'operacao_id'=>$key,
                            'total'=>$a['valor'],'pago'=>$a['pago'],
                            'pendente'=>$a['pendente'],
                        ];
                    }
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
                $line['abatido']=VendaMoney::decimal($line['abatido_centavos']);
                $line['recebido']=VendaMoney::decimal($line['pago_centavos']-$line['abatido_centavos']);
                unset($line['total_centavos'],$line['pago_centavos'],$line['abatido_centavos']);
            }
            unset($line);
            $due=$account['total_centavos'];
            $paid=$account['pago_centavos'];
            $offset=$account['abatido_centavos'];
            $account['resumo']=[
                'total'=>VendaMoney::decimal($due),
                'pago'=>VendaMoney::decimal($paid),
                'recebido'=>VendaMoney::decimal($paid-$offset),
                'abatido'=>VendaMoney::decimal($offset),
                'pendente'=>VendaMoney::decimal(max(0,$due-$paid)),
                'a_repassar'=>VendaMoney::decimal($account['obrigações_centavos']),
                'repasses_ja_pagos'=>VendaMoney::decimal($account['obrigações_pagas_centavos']),
                'repasses_pendentes'=>VendaMoney::decimal(max(0,
                    $account['obrigações_centavos']-$account['obrigações_pagas_centavos'])),
            ];
            unset($account['total_centavos'],$account['pago_centavos'],$account['abatido_centavos'],
                $account['obrigações_centavos'],$account['obrigações_pagas_centavos']);
            // Conta individual não recebe sequer no JSON os valores que deve
            // repassar a terceiros; mostra somente o líquido que lhe pertence.
            if(!$includeOutgoing){
                unset($account['saidas']);
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
        $canSeeOutgoing=$admin;
        if(!$admin){
            if(!$user->can('finance.own') || (! $user->inGroup('corretor') && ! $user->inGroup('vendedor') && ! $user->inGroup('gerente'))){
                return $this->errorResponse(403,'Acesso ao financeiro não autorizado.');
            }
            // Delegados consultam apenas a conta pessoal: jamais recebem o extrato dos terceiros.
            $delegado=$db->table('fechamento_responsabilidades')
                ->where('corretor_pessoa_id',$personId)->countAllResults()>0;
            $canSeeOutgoing=ExtratoPermissoes::repasses(false,$user->inGroup('corretor'),$delegado);
        }
        $operations=$this->rows($db,$start,$end);
        $accounts=$this->contasPorPessoa($db,$operations,$admin,$personId,$canSeeOutgoing);
        $lots=[];
        if($admin){
            $query=$db->table('comissao_lotes_pagamento l')
                ->select('l.id,l.pessoa_id,l.periodo_inicio,l.periodo_fim,l.data_pagamento,l.valor_total,l.valor_transferido,l.valor_abate,l.observacoes,p.nome AS pessoa_nome')
                ->join('pessoas p','p.id=l.pessoa_id')
                ->where('l.periodo_inicio >=',$start)->where('l.periodo_fim <=',$end)
                ->orderBy('l.id','DESC')->limit(150);
            if($personId!==null)$query->where('l.pessoa_id',$personId);
            $lots=$query->get()->getResultArray();
            if($lots){
                $lotIds=array_map(static fn($x)=>(int)$x['id'],$lots);
                $forms=$db->table('venda_formas_pagamento')->select('id,nome')->get()->getResultArray();
                $byForm=[];
                foreach($forms as $fm)$byForm[(int)$fm['id']]=$fm['nome'];
                $pieces=[];
                foreach(['comissao_repasses','comissao_titular_movimentos'] as $table){
                    foreach($db->table($table)->select('lote_id,forma_id,valor')
                        ->whereIn('lote_id',$lotIds)->where('tipo','PAGAMENTO')->get()->getResultArray() as $m){
                        $id=(int)$m['lote_id'];
                        $name=$byForm[(int)$m['forma_id']]??'Forma não informada';
                        $pieces[$id][$name]=($pieces[$id][$name]??0)+VendaMoney::cents((string)$m['valor']);
                    }
                }
                foreach($lots as &$lot){
                    $details=[];
                    foreach($pieces[(int)$lot['id']]??[] as $name=>$cent){
                        $details[]=['forma'=>$name,'valor'=>VendaMoney::decimal($cent)];
                    }
                    $lot['formas']=$details;
                }
                unset($lot);
            }
        }
        return $this->response->setJSON([
            'inicio'=>$start,'fim'=>$end,
            'contas'=>$accounts,'acertos'=>$lots,
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
        $formId=$this->optionalId($input['forma_id']??null);
        if(!$value||!$this->validateDate($date,false)||$reason===false||!$formId){
            return $this->errorResponse(422,'Valor, data e descrição do pagamento são obrigatórios.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$op||$op['situacao']!=='VENDA'||!$this->salePaid($db,$op)){
                $db->transRollback();
                return $this->errorResponse(409,'Só registre pagamentos de comissão em vendas quitadas.');
            }
            if(ProtecaoVendaFechada::bloqueada($db,(int)$id)){
                $db->transRollback();return $this->errorResponse(409,
                    'Esta venda pertence a um fechamento. Registre pagamentos somente no próprio fechamento enquanto estiver aberto.');
            }
            $state=$db->table('comissao_auto_apuracoes')
                ->where('operacao_id',(int)$id)->get()->getRowArray();
            $hasRateios=$db->table('comissao_rateios')->where('operacao_id',(int)$id)->countAllResults()>0;
            if((!$state || $state['status']==='REVISAR') && !$hasRateios){
                $db->transRollback();
                return $this->errorResponse(409,'Confira primeiro o rateio da venda. A parcela própria não pode ser paga antes da apuração.');
            }
            if(!$db->table('venda_formas_pagamento')->where('id',$formId)
                ->where('ativo',1)->where('codigo !=','ABATIMENTO_EMP')->countAllResults()){
                $db->transRollback();return $this->errorResponse(422,'Meio de pagamento inválido ou inativo.');
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
                'forma_id'=>$formId,
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
            if(ProtecaoVendaFechada::bloqueada($db,(int)$record['operacao_id'])){
                $db->transRollback();return $this->errorResponse(409,ProtecaoVendaFechada::MESSAGE);
            }
            $internalForm=$db->table('venda_formas_pagamento')->select('id')
                ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
            if($internalForm && (int)$record['forma_id']===(int)$internalForm['id']){
                $db->transRollback();
                return $this->errorResponse(409,'Abatimentos de empréstimo precisam de reversão conjunta do acerto. Não é permitido estorná-los isoladamente.');
            }
            if($db->table('comissao_titular_movimentos')->where('referencia_pagamento_id',(int)$id)->countAllResults()>0){
                $db->transRollback();return $this->errorResponse(409,'Pagamento já estornado.');
            }
            $db->table('comissao_titular_movimentos')->insert([
                'operacao_id'=>$record['operacao_id'],'corretor_pessoa_id'=>$record['corretor_pessoa_id'],
                'tipo'=>'ESTORNO','referencia_pagamento_id'=>(int)$id,
                'valor'=>$record['valor'],'data_pagamento'=>substr($this->now(),0,10),
                'forma_id'=>$record['forma_id'],'observacoes'=>$reason,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
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
            'aviso'=>'Resumo de comissões e participações registradas. Dinheiro em poder do corretor e valores que pertencem ao clube ainda requerem conciliação de caixa separada.',
        ])->setHeader('Cache-Control','no-store');
    }

    /** Compatibilidade: responde somente com o extrato individual seguro. */
    public function meu(): ResponseInterface
    {
        return $this->contas();
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
            'excecoes'=>$db->table('comissao_excecoes_plano')->orderBy('id','DESC')->get()->getResultArray(),
            'planos'=>$db->table('plano_versoes')->select('id,codigo,valor,duracao_meses,versao')
                ->orderBy('id','DESC')->get()->getResultArray(),
        ])->setHeader('Cache-Control','no-store');
    }

    public function salvarExcecao(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $body=$this->jsonPayload();
        $version=$this->optionalId($body['plano_versao_id']??null);
        $method=(string)($body['modalidade']??'');
        $day=(string)($body['tipo_dia']??'');
        $role=(string)($body['papel']??'');
        $kind=(string)($body['tipo_calculo']??'');
        $value=(string)($body['valor']??'');
        $obs=$this->cleanText($body['observacoes']??null,350);
        if(!$version||!in_array($method,['AVISTA','CARTAO','MISTO','TODOS'],true)
            ||!in_array($day,['UTIL','OUTROS','TODOS'],true)
            ||!in_array($role,['ATENDENTE','GERENTE'],true)
            ||!in_array($kind,['FIXO','PERCENTUAL'],true)||$obs===false){
            return $this->errorResponse(422,'Dados da regra de plano inválidos.');
        }
        $valueInCents=$this->money($value);
        if($valueInCents===null || ($kind==='PERCENTUAL' && $valueInCents>10000)){
            return $this->errorResponse(422,'Valor deve ser positivo; percentual não pode ultrapassar 100%.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $plan=$db->table('plano_versoes')->where('id',$version)->get()->getRowArray();
            if(!$plan){
                $db->transRollback();return $this->errorResponse(404,'Versão do plano não encontrada.');
            }
            $filter=['plano_versao_id'=>$version,'modalidade'=>$method,'tipo_dia'=>$day,'papel'=>$role];
            $existing=$db->table('comissao_excecoes_plano')->where($filter)->get()->getRowArray();
            $entry=[
                'tipo_calculo'=>$kind,'valor'=>VendaMoney::decimal($valueInCents),
                'observacoes'=>$obs,
            ];
            if($existing){
                $db->table('comissao_excecoes_plano')->where('id',$existing['id'])->update($entry);
            }else{
                $db->table('comissao_excecoes_plano')->insert([
                    ...$filter,...$entry,'criado_em'=>$this->now(),
                ]);
            }
            $this->commitOrFail($db);
            return $this->responseOK('Exceção registrada. Válida somente para próximas apurações.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'configurar exceção de comissão');
        }
    }

    public function excluirExcecao(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $db=db_connect();$db->transBegin();
        try{
            $found=$db->table('comissao_excecoes_plano')->where('id',(int)$id)->get()->getRowArray();
            if(!$found){
                $db->transRollback();return $this->errorResponse(404,'Exceção não encontrada.');
            }
            $db->table('comissao_excecoes_plano')->where('id',(int)$id)->delete();
            $this->commitOrFail($db);
            return $this->responseOK('Regra excluída para futuras apurações. Rateios existentes não foram alterados.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'excluir exceção');
        }
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
        foreach(['atendente_um_ano_valor','adicional_atendente_avista'] as $key){
            $raw=(string)($payload[$key]??'');
            $amount=VendaMoney::cents($raw,true);
            if($amount===null || $amount>10000000){
                return $this->errorResponse(422,'Valor inválido em '.$key.'. Informe entre R$ 0,00 e R$ 100.000,00.');
            }
            $values[$key]=VendaMoney::decimal($amount);
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


    public function formasPagamento(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        return $this->response->setJSON([
            'formas'=>db_connect()->table('venda_formas_pagamento')
                ->select('id,nome,codigo')->where('ativo',1)->where('codigo !=','ABATIMENTO_EMP')
                ->orderBy('nome','ASC')->get()->getResultArray(),
        ])->setHeader('Cache-Control','no-store');
    }

    public function pagarEmLote(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $data=$this->jsonPayload();
        $personId=$this->optionalId($data['pessoa_id']??null);
        $start=(string)($data['inicio']??'');
        $end=(string)($data['fim']??'');
        $paymentDate=(string)($data['data_pagamento']??'');
        $key=(string)($data['chave_requisicao']??'');
        $note=$this->cleanText($data['observacoes']??null,500);
        $items=$data['formas']??null;
        $deductions=$data['abatimentos']??[];
        if(!$personId||!$this->validateDate($start)||!$this->validateDate($end)
            ||$start>$end ||(new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days>366
            ||!$this->validateDate($paymentDate,false)
            ||!preg_match('/^[a-zA-Z0-9_-]{16,64}$/D',$key)
            ||$note===false||!is_array($items)||count($items)>10
            ||!is_array($deductions)||count($deductions)>20
            ||(count($items)===0 && count($deductions)===0)){
            return $this->errorResponse(422,'Revise período, beneficiário, data e meios de pagamento.');
        }
        $forms=[];$formIds=[];$sum=0;
        foreach($items as $item){
            if(!is_array($item))return $this->errorResponse(422,'Item de pagamento inválido.');
            $id=$this->optionalId($item['forma_id']??null);
            $value=$this->money($item['valor']??null);
            if(!$id || $value===null)return $this->errorResponse(422,'Informe valores positivos e meios válidos.');
            $formIds[$id]=true;
            $forms[]=['forma_id'=>$id,'valor_centavos'=>$value];
            $sum+=$value;
        }
        $abatimentos=[];$abatTotal=0;$loanIds=[];
        foreach($deductions as $abat){
            if(!is_array($abat))return $this->errorResponse(422,'Abatimento inválido.');
            $loanId=$this->optionalId($abat['emprestimo_id']??null);
            $cents=$this->money($abat['valor']??null);
            if(!$loanId||!$cents||isset($loanIds[$loanId])){
                return $this->errorResponse(422,'Informe um empréstimo distinto e valor de abatimento positivo.');
            }
            $loanIds[$loanId]=true;
            $abatimentos[]=['emprestimo_id'=>$loanId,'valor_centavos'=>$cents];
            $abatTotal+=$cents;
        }
        if($sum+$abatTotal<=0)return $this->errorResponse(422,'Valor do acerto inválido.');
        $db=db_connect();$db->transBegin();
        try{
            $previous=$db->table('comissao_lotes_pagamento')->where('chave_requisicao',$key)->get()->getRowArray();
            if($previous){
                $db->transRollback();
                return $this->responseOK('Acerto já registrado anteriormente, sem duplicação.',200,
                    ['lote_id'=>(int)$previous['id'],'duplicado'=>true]);
            }
            $valid=$formIds?$db->table('venda_formas_pagamento')->select('id,codigo')
                ->whereIn('id',array_keys($formIds))->where('ativo',1)->get()->getResultArray():[];
            if(count($valid)!==count($formIds)
                ||count(array_filter($valid,static fn($m)=>$m['codigo']==='ABATIMENTO_EMP'))>0){
                $db->transRollback();
                return $this->errorResponse(422,'Selecione meios de pagamento cadastrados e ativos.');
            }
            if($abatTotal>0){
                $internal=$db->table('venda_formas_pagamento')
                    ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
                if(!$internal){
                    $db->transRollback();return $this->errorResponse(409,'Forma interna de abatimento não configurada.');
                }
                // Empréstimos são bloqueados em ordem determinística para impedir abatimento concorrente.
                $sortedLoanIds=array_keys($loanIds);
                sort($sortedLoanIds,SORT_NUMERIC);
                $locked=[];
                foreach($sortedLoanIds as $loanId){
                    $loan=$db->query('SELECT * FROM financeiro_emprestimos WHERE id=? FOR UPDATE',[$loanId])->getRowArray();
                    if(!$loan||(int)$loan['pessoa_id']!==(int)$personId||$loan['situacao']!=='ATIVO'){
                        $db->transRollback();return $this->errorResponse(422,'Empréstimo não pertence à pessoa ou está inativo.');
                    }
                    $paidRows=$db->table('financeiro_emprestimo_abates')->select('valor')
                        ->where('emprestimo_id',$loanId)->get()->getResultArray();
                    $paid=0;
                    foreach($paidRows as $r)$paid+=VendaMoney::cents((string)$r['valor'],true);
                    $locked[$loanId]=VendaMoney::cents((string)$loan['valor'],true)-$paid;
                }
                foreach($abatimentos as $abat){
                    if($abat['valor_centavos']>$locked[$abat['emprestimo_id']]){
                        $db->transRollback();return $this->errorResponse(422,'Abatimento maior que o saldo do empréstimo.');
                    }
                }
                $forms[]=['forma_id'=>(int)$internal['id'],'valor_centavos'=>$abatTotal];
            }
            $person=$db->table('pessoas')->select('id')->where('id',$personId)->get()->getRowArray();
            if(!$person){
                $db->transRollback();return $this->errorResponse(404,'Pessoa não encontrada.');
            }
            // A mesma ordem de locks usada pelos pagamentos individuais (operação).
            $rows=$db->table('venda_operacoes')->select('id')->where('situacao','VENDA')
                ->where('data_venda >=',$start)->where('data_venda <=',$end)
                ->orderBy('id','ASC')->limit(501)->get()->getResultArray();
            if(count($rows)>500){
                $db->transRollback();
                return $this->errorResponse(409,'Mais de 500 vendas no período. Reduza as datas para um acerto seguro.');
            }
            foreach($rows as $row){
                $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$row['id']])->getRowArray();
            }
            $operations=$this->rows($db,$start,$end);
            foreach($operations as $op){
                $incoming=false;$outgoing=false;
                foreach($op['rateios'] as $rateio){
                    if((int)$rateio['beneficiario_pessoa_id']===(int)$personId)$incoming=true;
                    if((int)$rateio['responsavel_pessoa_id']===(int)$personId)$outgoing=true;
                }
                if($incoming && $outgoing){
                    $db->transRollback();
                    return $this->errorResponse(409,'Esta pessoa também redistribui comissão recebida nesta venda. É necessário conferir o rateio antes do acerto automático para não pagar duas vezes.');
                }
            }
            $accounts=$this->contasPorPessoa($db,$operations,true,(int)$personId);
            if(!$accounts){
                $db->transRollback();return $this->errorResponse(409,'Nenhum valor disponível para esta pessoa no período.');
            }
            $lines=[];
            foreach($accounts[0]['itens'] as $item){
                $pending=VendaMoney::cents((string)$item['pendente'],true);
                if($pending>0)$lines[]=[
                    'operacao_id'=>(int)$item['operacao_id'],
                    'rateio_id'=>$item['rateio_id']===null?null:(int)$item['rateio_id'],
                    'tipo'=>$item['tipo'],'data_venda'=>$item['data_venda'],
                    'pendente_centavos'=>$pending,
                ];
            }
            foreach($lines as $line){
                if(ProtecaoVendaFechada::bloqueada($db,(int)$line['operacao_id'])){
                    $db->transRollback();
                    return $this->errorResponse(409,'Há comissões de vendas vinculadas a fechamento neste período. Registre esses pagamentos no fechamento correspondente, não no lote legado.');
                }
            }
            try{
                $distribution=DistribuicaoPagamento::calcular($lines,$forms);
            }catch(\InvalidArgumentException $e){
                $db->transRollback();return $this->errorResponse(422,$e->getMessage());
            }
            $now=$this->now();
            $db->table('comissao_lotes_pagamento')->insert([
                'pessoa_id'=>$personId,'periodo_inicio'=>$start,'periodo_fim'=>$end,
                'data_pagamento'=>$paymentDate,'valor_total'=>VendaMoney::decimal($sum+$abatTotal),
                'valor_transferido'=>VendaMoney::decimal($sum),
                'valor_abate'=>VendaMoney::decimal($abatTotal),
                'observacoes'=>$note,'chave_requisicao'=>$key,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$now,
            ]);
            $lotId=(int)$db->insertID();
            foreach($abatimentos as $abat){
                $db->table('financeiro_emprestimo_abates')->insert([
                    'emprestimo_id'=>$abat['emprestimo_id'],
                    'lote_id'=>$lotId,
                    'valor'=>VendaMoney::decimal($abat['valor_centavos']),
                    'data_abate'=>$paymentDate,
                    'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                    'criado_em'=>$now,
                ]);
            }
            foreach($distribution as $piece){
                $base=[
                    'tipo'=>'PAGAMENTO','referencia_pagamento_id'=>null,
                    'valor'=>VendaMoney::decimal($piece['valor_centavos']),
                    'data_pagamento'=>$paymentDate,'observacoes'=>$note,
                    'lote_id'=>$lotId,'forma_id'=>$piece['forma_id'],
                    'criado_por_usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$now,
                ];
                if($piece['tipo']==='TITULAR'){
                    $db->table('comissao_titular_movimentos')->insert([
                        ...$base,'operacao_id'=>$piece['operacao_id'],
                        'corretor_pessoa_id'=>$personId,
                    ]);
                }else{
                    $db->table('comissao_repasses')->insert([
                        ...$base,'rateio_id'=>$piece['rateio_id'],
                    ]);
                }
            }
            $this->commitOrFail($db);
            return $this->responseOK('Acerto por pessoa registrado, separado por venda e forma de pagamento.',200,[
                'lote_id'=>$lotId,'valor_total'=>VendaMoney::decimal($sum+$abatTotal),
                'valor_transferido'=>VendaMoney::decimal($sum),
                'valor_abate'=>VendaMoney::decimal($abatTotal),
                'distribuicoes'=>count($distribution),
            ]);
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'registrar acerto semanal multi-forma');
        }
    }

    /**
     * Rateios de uma venda específica, com acesso somente administrativo.
     * Não gera pagamento e só libera edição antes de qualquer movimentação
     * financeira da comissão.
     */
    public function rateiosVenda(int|string $id): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $db=db_connect();
        $op=$db->table('venda_operacoes')->where('id',(int)$id)->get()->getRowArray();
        if(!$op)return $this->errorResponse(404,'Venda não encontrada.');
        $fechamento=ProtecaoVendaFechada::fechamento($db,(int)$id);
        $rateios=$db->table('comissao_rateios r')
            ->select('r.*,p.nome AS beneficiario_nome')
            ->join('pessoas p','p.id=r.beneficiario_pessoa_id')
            ->where('r.operacao_id',(int)$id)->orderBy('r.id','ASC')->get()->getResultArray();
        $rateioIds=array_map(static fn($x)=>(int)$x['id'],$rateios);
        $rateioMovimentado=$rateioIds&&$db->table('comissao_repasses')
            ->whereIn('rateio_id',$rateioIds)->countAllResults()>0;
        $titularMovimentado=$db->table('comissao_titular_movimentos')
            ->where('operacao_id',(int)$id)->countAllResults()>0;
        $comissao=$this->commission($op);
        $quitada=$this->salePaid($db,$op);
        $editavel=$fechamento===null && $op['situacao']==='VENDA'
            && $comissao!==null && $quitada
            && !$rateioMovimentado && !$titularMovimentado;
        return $this->response->setJSON([
            'operacao_id'=>(int)$id,
            'corretor_pessoa_id'=>(int)$op['corretor_pessoa_id'],
            'comissao_bruta'=>$comissao===null?null:VendaMoney::decimal($comissao),
            'quitada'=>$quitada,
            'editavel'=>$editavel,'fechamento'=>$fechamento,
            'rateios'=>$rateios,
            'aviso'=>$fechamento!==null?ProtecaoVendaFechada::MESSAGE
                .' Fechamento #'.$fechamento['id'].'.'
                :(!$quitada?'Ajustes disponíveis após a quitação da venda.'
                :($rateioMovimentado||$titularMovimentado
                    ?'Rateios bloqueados por pagamentos/estornos já registrados. O histórico não será sobrescrito.'
                    :'Confira e salve as participações antes do fechamento semanal.')),
        ])->setHeader('Cache-Control','no-store');
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
            if(ProtecaoVendaFechada::bloqueada($db,(int)$id)){
                $db->transRollback();return $this->errorResponse(409,ProtecaoVendaFechada::MESSAGE);
            }
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
        $formId=$this->optionalId($input['forma_id']??null);
        if($value===null||!$this->validateDate($date,false)||$note===false||!$formId){
            return $this->errorResponse(422,'Informe valor, data e observações válidos.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $allocation=$db->table('comissao_rateios')->where('id',(int)$id)->get()->getRowArray();
            if($allocation)$db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$allocation['operacao_id']])->getRowArray();
            if(!$allocation){
                $db->transRollback();return $this->errorResponse(404,'Participação não encontrada.');
            }
            if(ProtecaoVendaFechada::bloqueada($db,(int)$allocation['operacao_id'])){
                $db->transRollback();return $this->errorResponse(409,ProtecaoVendaFechada::MESSAGE);
            }
            if(!$db->table('venda_formas_pagamento')->where('id',$formId)->where('ativo',1)->countAllResults()){
                $db->transRollback();return $this->errorResponse(422,'Meio de pagamento inválido ou inativo.');
            }
            $paid=$this->sumPaid($db,(int)$id);
            $total=VendaMoney::cents((string)$allocation['valor']);
            if($value>$total-$paid){
                $db->transRollback();return $this->errorResponse(422,'Pagamento supera o saldo ainda devido ao participante.');
            }
            $db->table('comissao_repasses')->insert([
                'rateio_id'=>(int)$id,'tipo'=>'PAGAMENTO','referencia_pagamento_id'=>null,
                'valor'=>VendaMoney::decimal($value),'data_pagamento'=>$date,
                'forma_id'=>$formId,'observacoes'=>$note,
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
            $alloc=$db->table('comissao_rateios')->select('operacao_id')
                ->where('id',(int)$pay['rateio_id'])->get()->getRowArray();
            if($alloc && ProtecaoVendaFechada::bloqueada($db,(int)$alloc['operacao_id'])){
                $db->transRollback();return $this->errorResponse(409,ProtecaoVendaFechada::MESSAGE);
            }
            $internalForm=$db->table('venda_formas_pagamento')->select('id')
                ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
            if($internalForm && (int)$pay['forma_id']===(int)$internalForm['id']){
                $db->transRollback();
                return $this->errorResponse(409,'Abatimentos de empréstimo precisam de reversão conjunta do acerto. Não é permitido estorná-los isoladamente.');
            }
            if($db->table('comissao_repasses')->where('referencia_pagamento_id',(int)$id)->countAllResults()>0){
                $db->transRollback();return $this->errorResponse(409,'Esse pagamento já foi estornado.');
            }
            $db->table('comissao_repasses')->insert([
                'rateio_id'=>(int)$pay['rateio_id'],'tipo'=>'ESTORNO',
                'referencia_pagamento_id'=>(int)$id,
                'valor'=>$pay['valor'],'data_pagamento'=>substr($this->now(),0,10),
                'forma_id'=>$pay['forma_id'],'observacoes'=>$reason,
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
        $moves=$db->table('comissao_repasses m')
            ->select('m.*,f.nome AS forma_nome')
            ->join('venda_formas_pagamento f','f.id=m.forma_id','left')
            ->where('m.rateio_id',(int)$id)
            ->orderBy('m.id','DESC')->get()->getResultArray();
        return $this->response->setJSON(['rateio'=>$allocation,'movimentos'=>$moves,
            'pago'=>VendaMoney::decimal($this->sumPaid($db,(int)$id))])
            ->setHeader('Cache-Control','no-store');
    }
}
