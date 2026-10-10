<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VendaMoney;
use App\Libraries\FechamentoEscopo;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Fechamento separado por RESPONSÁVEL, não por clube ou dono da corrente.
 * Só o administrador cadastra responsabilidade; corretor independente usa
 * exclusivamente sua própria pessoa Shield, nunca um ID enviado pelo cliente.
 */
class FechamentosPeriodosController extends CommercialBaseController
{
    private function acesso(): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        $admin=$user->inGroup('admin') && $user->can('closings.manage');
        if(!$admin && (!$user->inGroup('corretor') || !$user->can('finance.own'))){
            return $this->errorResponse(403,'Somente corretores responsáveis podem realizar seu fechamento.');
        }
        $person=db_connect()->table('pessoas')->select('id,nome')->where('user_id',(int)$user->id)
            ->where('ativo',1)->get()->getRowArray();
        if(!$admin && !$person)return $this->errorResponse(403,'Conta sem pessoa ativa vinculada.');
        return ['admin'=>$admin,'pessoa_id'=>$person?(int)$person['id']:null,'usuario_id'=>(int)$user->id];
    }

    private function cents(mixed $value): ?int
    {
        $n=VendaMoney::cents($value);
        return $n!==null && $n>0?$n:null;
    }

    private function validPeriod(string $start,string $end): bool
    {
        return $this->validateDate($start) && $this->validateDate($end) && $start<=$end &&
            (new \DateTimeImmutable($start))->diff(new \DateTimeImmutable($end))->days<=366;
    }

    private function now(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }

    /** A vinculação explícita é o único fundamento para incluir outra pessoa. */
    private function members($db,int $root): array
    {
        $rows=$db->table('fechamento_responsabilidades')
            ->select('corretor_pessoa_id,responsavel_pessoa_id')
            ->where('responsavel_pessoa_id',$root)->get()->getResultArray();
        return FechamentoEscopo::membros($root,$rows);
    }

    private function isDelegated($db,int $personId): bool
    {
        return $db->table('fechamento_responsabilidades')->where('corretor_pessoa_id',$personId)
            ->countAllResults()>0;
    }

    private function getPeriod($db,int $id,array $actor,bool $lock=false): array|ResponseInterface
    {
        $query=$db->table('fechamento_periodos p')->select('p.*,b.nome AS responsavel_nome')
            ->join('pessoas b','b.id=p.responsavel_pessoa_id')->where('p.id',$id);
        $period=$query->get()->getRowArray();
        if(!$period)return $this->errorResponse(404,'Fechamento não encontrado.');
        if(!$actor['admin'] && (int)$period['responsavel_pessoa_id']!==$actor['pessoa_id']){
            return $this->errorResponse(403,'Fechamento pertence a outro corretor.');
        }
        if($lock){
            $db->query('SELECT id FROM fechamento_periodos WHERE id=? FOR UPDATE',[$id])->getRowArray();
        }
        return $period;
    }

    public function escopos(): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $people=$db->table('pessoas p')->select('p.id,p.nome,p.user_id')
            ->join('pessoa_papeis pp','pp.pessoa_id=p.id')
            ->where('pp.papel','corretor')->where('p.ativo',1)
            ->orderBy('p.nome')->get()->getResultArray();
        $assignment=$db->table('fechamento_responsabilidades')->get()->getResultArray();
        $byChild=[];foreach($assignment as $a)$byChild[(int)$a['corretor_pessoa_id']]=(int)$a['responsavel_pessoa_id'];
        $options=[];
        foreach($people as $p){
            $id=(int)$p['id'];$boss=$byChild[$id]??null;
            if(!$actor['admin'] && $id!==$actor['pessoa_id'])continue;
            $options[]=[
                'id'=>$id,'nome'=>$p['nome'],'responsavel_id'=>$boss,
                'pode_fechar'=>$boss===null,
                'grupo'=>$boss===null?$this->members($db,$id):[],
            ];
        }
        return $this->response->setJSON(['responsaveis'=>$options,
            'formas'=>$db->table('venda_formas_pagamento')->select('id,nome,codigo')
                ->where('ativo',1)->where('codigo !=','ABATIMENTO_EMP')->orderBy('nome')->get()->getResultArray(),
            'vinculos'=>$actor['admin']?$assignment:[],
            'pessoa_logada'=>$actor['pessoa_id'],
            'administrador'=>$actor['admin'],
        ])->setHeader('Cache-Control','no-store');
    }

    public function vincular(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $data=$this->jsonPayload();
        $child=$this->optionalId($data['corretor_pessoa_id']??null);
        $boss=$this->optionalId($data['responsavel_pessoa_id']??null);
        if(!$child||$boss===false||($boss!==null && $child===$boss)){
            return $this->errorResponse(422,'Escolha um corretor e um responsável diferente, ou desvincule.');
        }
        $db=db_connect();$db->transBegin();
        try{
            // Lock de pessoas evita criar ciclos em requisições simultâneas.
            $ids=array_values(array_filter([$child,$boss]));sort($ids,SORT_NUMERIC);
            foreach($ids as $id)$db->query('SELECT id FROM pessoas WHERE id=? FOR UPDATE',[$id])->getRowArray();
            $person=$db->table('pessoas')->where('id',$child)->where('ativo',1)->get()->getRowArray();
            if(!$person || !$db->table('pessoa_papeis')->where('pessoa_id',$child)->where('papel','corretor')->countAllResults()){
                $db->transRollback();return $this->errorResponse(422,'Corretor inválido ou inativo.');
            }
            if($boss!==null){
                if(!$db->table('pessoas')->where('id',$boss)->where('ativo',1)->countAllResults()
                    || !$db->table('pessoa_papeis')->where('pessoa_id',$boss)->where('papel','corretor')->countAllResults()){
                    $db->transRollback();return $this->errorResponse(422,'Responsável deve ser corretor ativo.');
                }
                if($this->isDelegated($db,$boss) || count($this->members($db,$child))>1){
                    $db->transRollback();return $this->errorResponse(409,'Não são permitidos grupos de administração em cascata.');
                }
            }
            $active=$db->table('fechamento_periodos p')
                ->join('fechamento_periodo_pessoas m','m.fechamento_id=p.id')
                ->where('m.pessoa_id',$child)->where('p.status !=','CONCLUIDO')
                ->countAllResults();
            if($active){
                $db->transRollback();
                return $this->errorResponse(409,'Conclua os fechamentos abertos deste corretor antes de alterar sua administração.');
            }
            if($boss!==null && $db->table('fechamento_periodos')
                ->where('responsavel_pessoa_id',$boss)->where('status !=','CONCLUIDO')->countAllResults()){
                $db->transRollback();
                return $this->errorResponse(409,'Conclua primeiro o fechamento aberto do responsável antes de alterar sua equipe.');
            }
            $db->table('fechamento_responsabilidades')->where('corretor_pessoa_id',$child)->delete();
            if($boss!==null)$db->table('fechamento_responsabilidades')->insert([
                'corretor_pessoa_id'=>$child,'responsavel_pessoa_id'=>$boss,'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK($boss===null?'Corretor independente.':'Corretor vinculado para próximos fechamentos.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'vincular corretor a responsável');}
    }

    public function listar(): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $query=$db->table('fechamento_periodos f')->select('f.id,f.responsavel_pessoa_id,f.inicio,f.fim,f.status,f.criado_em,f.concluido_em,r.nome AS responsavel_nome')
            ->join('pessoas r','r.id=f.responsavel_pessoa_id');
        if(!$actor['admin'])$query->where('f.responsavel_pessoa_id',$actor['pessoa_id']);
        $rows=$query->orderBy('f.id','DESC')->limit(150)->get()->getResultArray();
        return $this->response->setJSON(['fechamentos'=>$rows])->setHeader('Cache-Control','no-store');
    }

    public function abrir(): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $data=$this->jsonPayload();
        $start=(string)($data['inicio']??'');$end=(string)($data['fim']??'');
        $root=$actor['admin']?$this->optionalId($data['responsavel_pessoa_id']??null):$actor['pessoa_id'];
        if(!$root||!$this->validPeriod($start,$end))return $this->errorResponse(422,'Informe responsável e período válido (até 366 dias).');
        $db=db_connect();$db->transBegin();
        try{
            $db->query('SELECT id FROM pessoas WHERE id=? FOR UPDATE',[$root])->getRowArray();
            if(!$db->table('pessoas')->where('id',$root)->where('ativo',1)->countAllResults()
                || !$db->table('pessoa_papeis')->where('pessoa_id',$root)->where('papel','corretor')->countAllResults()){
                $db->transRollback();return $this->errorResponse(422,'Responsável precisa ser um corretor ativo.');
            }
            if($this->isDelegated($db,$root)){
                $db->transRollback();return $this->errorResponse(409,'Este corretor é administrado por outro responsável e não pode abrir fechamento separado.');
            }
            $members=$this->members($db,$root);
            sort($members,SORT_NUMERIC);
            foreach($members as $id)$db->query('SELECT id FROM pessoas WHERE id=? FOR UPDATE',[$id])->getRowArray();
            $old=$db->table('fechamento_periodos')
                ->where('responsavel_pessoa_id',$root)
                ->where('inicio <=',$end)->where('fim >=',$start)->get()->getRowArray();
            if($old){
                $db->transRollback();
                return $this->errorResponse(409,'O período se sobrepõe a outro fechamento deste responsável (#'.$old['id'].').');
            }
            $sales=$db->table('venda_operacoes')
                ->select('id,corretor_pessoa_id')
                ->whereIn('corretor_pessoa_id',$members)
                ->where('situacao','VENDA')
                ->where('data_venda >=',$start)->where('data_venda <=',$end)
                ->orderBy('id')->limit(501)->get()->getResultArray();
            if(count($sales)>500){
                $db->transRollback();return $this->errorResponse(409,'Mais de 500 vendas. Reduza o período.');
            }
            foreach($sales as $sale){
                $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$sale['id']])->getRowArray();
                if($db->table('fechamento_periodo_vendas')->where('operacao_id',(int)$sale['id'])->countAllResults()){
                    $db->transRollback();return $this->errorResponse(409,'Uma venda do período já pertence a outro fechamento. Consulte o histórico.');
                }
            }
            $db->table('fechamento_periodos')->insert([
                'responsavel_pessoa_id'=>$root,'inicio'=>$start,'fim'=>$end,
                'status'=>'RECEBIMENTOS','criado_por_usuario_id'=>$actor['usuario_id'],'criado_em'=>$this->now(),
            ]);
            $id=(int)$db->insertID();
            foreach($members as $pid)$db->table('fechamento_periodo_pessoas')->insert([
                'fechamento_id'=>$id,'pessoa_id'=>$pid,
            ]);
            foreach($sales as $sale)$db->table('fechamento_periodo_vendas')->insert([
                'fechamento_id'=>$id,'operacao_id'=>(int)$sale['id'],
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Fechamento aberto somente para este responsável e seus corretores vinculados.',201,['id'=>$id]);
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'abrir fechamento de período');}
    }

    private function resumo($db,array $period): array
    {
        if($period['status']==='CONCLUIDO' && $period['resumo_concluido']){
            $frozen=json_decode((string)$period['resumo_concluido'],true);
            if(is_array($frozen))return $frozen;
        }
        $id=(int)$period['id'];
        $members=$db->table('fechamento_periodo_pessoas m')->select('m.pessoa_id,p.nome')
            ->join('pessoas p','p.id=m.pessoa_id')->where('m.fechamento_id',$id)
            ->orderBy('p.nome')->get()->getResultArray();
        $ids=array_map(static fn($p)=>(int)$p['pessoa_id'],$members);
        $byPerson=[];
        foreach($members as $p)$byPerson[(int)$p['pessoa_id']]=[
            'pessoa_id'=>(int)$p['pessoa_id'],'nome'=>$p['nome'],
            'comissao_cent'=>0,'titular_pago_cent'=>0,'repasse_cent'=>0,
            'repasse_pago_cent'=>0,'recebido_clube_cent'=>0,'abatido_cent'=>0,
            'despesas_cent'=>0,'vendas'=>[],
        ];
        $sales=$db->table('fechamento_periodo_vendas f')
            ->select('v.id,v.corretor_pessoa_id,v.numero_titulo,v.sigla_plano,v.data_venda,v.comissao_prevista,v.comissao_ajustada,v.valor_cobrado')
            ->join('venda_operacoes v','v.id=f.operacao_id')
            ->where('f.fechamento_id',$id)->orderBy('v.data_venda')->orderBy('v.id')->get()->getResultArray();
        $saleIds=array_map(static fn($r)=>(int)$r['id'],$sales);
        $gross=0;
        foreach($sales as $sale){
            $pid=(int)$sale['corretor_pessoa_id'];
            $base=$sale['comissao_ajustada']??$sale['comissao_prevista'];
            $c=$base===null?0:VendaMoney::cents((string)$base,true);
            $byPerson[$pid]['comissao_cent']+=$c;$gross+=$c;
            $byPerson[$pid]['vendas'][]=[
                'id'=>(int)$sale['id'],'data'=>$sale['data_venda'],
                'titulo'=>trim((string)$sale['numero_titulo'].' '.(string)$sale['sigla_plano']),
                'comissao'=>$base===null?null:VendaMoney::decimal($c),
                'situacao'=>$base===null?'REVISAR':'APURADA',
            ];
        }
        $rates=[];$participant=[];
        if($saleIds){
            $rs=$db->table('comissao_rateios r')->select('r.*,b.nome AS beneficiario_nome')
                ->join('pessoas b','b.id=r.beneficiario_pessoa_id')
                ->whereIn('r.operacao_id',$saleIds)->get()->getResultArray();
            $rateIds=array_map(static fn($r)=>(int)$r['id'],$rs);
            $paid=[];
            if($rateIds){
                foreach($db->table('comissao_repasses')->select('rateio_id,tipo,valor')
                    ->whereIn('rateio_id',$rateIds)->get()->getResultArray() as $m){
                    $key=(int)$m['rateio_id'];
                    $paid[$key]=($paid[$key]??0)+($m['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$m['valor'],true);
                }
            }
            foreach($rs as $r){
                $payer=(int)$r['responsavel_pessoa_id'];$benef=(int)$r['beneficiario_pessoa_id'];
                // Só repasses cujo responsável pertence a este fechamento.
                if(!isset($byPerson[$payer]))continue;
                $total=VendaMoney::cents((string)$r['valor'],true);
                $done=$paid[(int)$r['id']]??0;
                $byPerson[$payer]['repasse_cent']+=$total;
                $byPerson[$payer]['repasse_pago_cent']+=$done;
                $participant[$benef]??=['pessoa_id'=>$benef,'nome'=>$r['beneficiario_nome'],
                    'total_cent'=>0,'pago_cent'=>0,'rateios'=>[]];
                $participant[$benef]['total_cent']+=$total;$participant[$benef]['pago_cent']+=$done;
                $participant[$benef]['rateios'][]=['id'=>(int)$r['id'],
                    'venda_id'=>(int)$r['operacao_id'],'papel'=>$r['papel'],
                    'valor'=>VendaMoney::decimal($total),'pago'=>VendaMoney::decimal($done),
                    'pendente'=>VendaMoney::decimal(max(0,$total-$done))];
            }
            foreach($db->table('comissao_titular_movimentos')->select('operacao_id,tipo,valor')
                ->whereIn('operacao_id',$saleIds)->get()->getResultArray() as $m){
                foreach($sales as $sale)if((int)$sale['id']===(int)$m['operacao_id']){
                    $pid=(int)$sale['corretor_pessoa_id'];
                    $byPerson[$pid]['titular_pago_cent']+=($m['tipo']==='PAGAMENTO'?1:-1)
                        *VendaMoney::cents((string)$m['valor'],true);break;
                }
            }
        }
        $entries=$db->table('fechamento_periodo_entradas e')
            ->select('e.*,m.nome AS forma,p.nome AS corretor_nome')
            ->join('venda_formas_pagamento m','m.id=e.forma_id')
            ->join('pessoas p','p.id=e.corretor_pessoa_id')
            ->where('e.fechamento_id',$id)->orderBy('e.id')->get()->getResultArray();
        $cash=0;
        foreach($entries as &$entry){
            $c=VendaMoney::cents((string)$entry['valor'],true);
            $cash+=$c;$byPerson[(int)$entry['corretor_pessoa_id']]['recebido_clube_cent']+=$c;
        }
        unset($entry);
        $offsetRows=$db->table('fechamento_periodo_abates a')
            ->select('a.*,e.pessoa_id,p.nome AS pessoa_nome')
            ->join('financeiro_emprestimos e','e.id=a.emprestimo_id')
            ->join('pessoas p','p.id=e.pessoa_id')
            ->where('a.fechamento_id',$id)->get()->getResultArray();
        $offsets=0;
        foreach($offsetRows as $a){
            $c=VendaMoney::cents((string)$a['valor'],true);
            $offsets+=$c;$byPerson[(int)$a['pessoa_id']]['abatido_cent']+=$c;
        }
        $loans=$db->table('financeiro_emprestimos l')
            ->select('l.id,l.pessoa_id,l.valor,l.descricao,l.data_emprestimo,p.nome AS pessoa_nome')
            ->join('pessoas p','p.id=l.pessoa_id')
            ->whereIn('l.pessoa_id',$ids)->where('l.situacao','ATIVO')
            ->orderBy('l.data_emprestimo')->get()->getResultArray();
        if($loans){
            $loanIds=array_map(static fn($x)=>(int)$x['id'],$loans);
            $amounts=[];
            foreach($db->table('financeiro_emprestimo_abates')->select('emprestimo_id,valor')
                ->whereIn('emprestimo_id',$loanIds)->get()->getResultArray() as $r){
                $k=(int)$r['emprestimo_id'];
                $amounts[$k]=($amounts[$k]??0)+VendaMoney::cents((string)$r['valor'],true);
            }
            foreach($loans as &$loan){
                $loan['saldo']=VendaMoney::decimal(max(0,
                    VendaMoney::cents((string)$loan['valor'],true)-($amounts[(int)$loan['id']]??0)));
            }unset($loan);
        }
        $costRows=$db->table('financeiro_despesas')
            ->select('pessoa_id,valor')->whereIn('pessoa_id',$ids)
            ->where('data_despesa >=',$period['inicio'])->where('data_despesa <=',$period['fim'])
            ->where('situacao','ATIVA')->get()->getResultArray();
        $costs=0;
        foreach($costRows as $cost){$c=VendaMoney::cents((string)$cost['valor'],true);$costs+=$c;$byPerson[(int)$cost['pessoa_id']]['despesas_cent']+=$c;}
        $paidInClosing=0;
        foreach(['fechamento_periodo_repasses','fechamento_periodo_titulares'] as $table){
            $periodPayments=$db->table($table)->select('valor,forma_id')
                ->where('fechamento_id',$id)->where('situacao','ATIVO')->get()->getResultArray();
            $internalId=$db->table('venda_formas_pagamento')->select('id')
                ->where('codigo','ABATIMENTO_EMP')->get()->getRow('id');
            foreach($periodPayments as $m){
                if($table==='fechamento_periodo_titulares' && (int)$m['forma_id']===(int)$internalId)continue;
                $paidInClosing+=VendaMoney::cents((string)$m['valor'],true);
            }
        }
        $titularHistory=$db->table('fechamento_periodo_titulares f')
            ->select('f.id,f.operacao_id,f.valor,f.situacao,p.nome AS beneficiario_nome,m.nome AS forma_nome,v.corretor_pessoa_id')
            ->join('venda_operacoes v','v.id=f.operacao_id')
            ->join('pessoas p','p.id=v.corretor_pessoa_id')
            ->join('venda_formas_pagamento m','m.id=f.forma_id')
            ->where('f.fechamento_id',$id)->orderBy('f.id','DESC')->get()->getResultArray();
        $paymentHistory=$db->table('fechamento_periodo_repasses f')
            ->select('f.id,f.rateio_id,f.valor,f.situacao,b.nome AS beneficiario_nome,m.nome AS forma_nome,r.beneficiario_pessoa_id')
            ->join('comissao_rateios r','r.id=f.rateio_id')
            ->join('pessoas b','b.id=r.beneficiario_pessoa_id')
            ->join('venda_formas_pagamento m','m.id=f.forma_id')
            ->where('f.fechamento_id',$id)->orderBy('f.id','DESC')->get()->getResultArray();

        $sumRates=0;$sumPaid=0;
        foreach($participant as &$p){
            $sumRates+=$p['total_cent'];$sumPaid+=$p['pago_cent'];
            $p['total']=VendaMoney::decimal($p['total_cent']);
            $p['pago']=VendaMoney::decimal($p['pago_cent']);
            $p['pendente']=VendaMoney::decimal(max(0,$p['total_cent']-$p['pago_cent']));
            unset($p['total_cent'],$p['pago_cent']);
        }unset($p);
        $estAReceber=0;
        $participacoesInternas=[];
        foreach($participant as $recebedor){
            $benef=(int)$recebedor['pessoa_id'];
            if(isset($byPerson[$benef]))$participacoesInternas[$benef]=$recebedor;
        }
        foreach($byPerson as &$person){
            $participacao=$participacoesInternas[(int)$person['pessoa_id']]??null;
            $person['participacoes_total']=$participacao['total']??'0.00';
            $person['participacoes_recebidas']=$participacao['pago']??'0.00';
            $person['participacoes_pendentes']=$participacao['pendente']??'0.00';
            // Estimativa: valores da comissão que ainda não constam como
            // pagos ao titular, recebidos do clube ou abatidos neste período.
            // Dinheiro retido anteriormente exige conciliação manual.
            $falta=$person['comissao_cent']-$person['titular_pago_cent']
                -$person['recebido_clube_cent']-$person['abatido_cent'];
            $person['a_receber_estimado']=VendaMoney::decimal(max(0,$falta));
            $person['excesso_a_conciliar']=VendaMoney::decimal(max(0,-$falta));
            $estAReceber+=max(0,$falta);
            $person['comissao']=VendaMoney::decimal($person['comissao_cent']);
            $person['recebido_clube']=VendaMoney::decimal($person['recebido_clube_cent']);
            $person['titular_ja_recebido']=VendaMoney::decimal($person['titular_pago_cent']);
            $person['titular_total']=VendaMoney::decimal(max(0,$person['comissao_cent']-$person['repasse_cent']));
            $person['titular_pendente']=VendaMoney::decimal(max(0,
                $person['comissao_cent']-$person['repasse_cent']-$person['titular_pago_cent']));
            $person['repasse_total']=VendaMoney::decimal($person['repasse_cent']);
            $person['repasse_ja_pago']=VendaMoney::decimal($person['repasse_pago_cent']);
            $person['repasse_pendente']=VendaMoney::decimal(max(0,$person['repasse_cent']-$person['repasse_pago_cent']));
            $person['abatido']=VendaMoney::decimal($person['abatido_cent']);
            $person['despesas']=VendaMoney::decimal($person['despesas_cent']);
            $person['resultado_estimado']=VendaMoney::decimal($person['comissao_cent']-$person['repasse_cent']-$person['despesas_cent']);
            // Entradas deste fechamento e movimentações históricas de comissão são fontes
            // diferentes: não presumir que uma já foi lançada como a outra.
            $person['comissao_sem_conciliacao']=VendaMoney::decimal(max(0,$person['comissao_cent']-$person['titular_pago_cent']));
            foreach(array_keys($person) as $key)if(str_ends_with($key,'_cent'))unset($person[$key]);
        }unset($person);
        return [
            'id'=>$id,'responsavel_pessoa_id'=>(int)$period['responsavel_pessoa_id'],
            'responsavel_nome'=>$period['responsavel_nome']??'',
            'inicio'=>$period['inicio'],'fim'=>$period['fim'],
            'status'=>$period['status'],'concluido_em'=>$period['concluido_em'],
            'corretores'=>array_values($byPerson),'participantes'=>array_values($participant),
            'entradas'=>$entries,'abatimentos'=>$offsetRows,'emprestimos'=>$loans,
            'historico_repasses'=>$paymentHistory,'historico_titulares'=>$titularHistory,
            'quantidade_vendas'=>count($sales),
            'resumo'=>[
                'comissoes'=>VendaMoney::decimal($gross),
                'a_receber_estimado'=>VendaMoney::decimal($estAReceber),
                'recebido_clube'=>VendaMoney::decimal($cash),
                'abatido_dividas'=>VendaMoney::decimal($offsets),
                'pagamentos_periodo'=>VendaMoney::decimal($paidInClosing),
                'total_rateios'=>VendaMoney::decimal($sumRates),
                'rateios_ja_pagos'=>VendaMoney::decimal($sumPaid),
                'rateios_pendentes'=>VendaMoney::decimal(max(0,$sumRates-$sumPaid)),
                'despesas'=>VendaMoney::decimal($costs),
                'saldo_caixa_registrado'=>VendaMoney::decimal($cash-$paidInClosing),
                'resultado_gerencial_estimado'=>VendaMoney::decimal($gross-$sumRates-$costs),
            ],
            'observacao'=>'Entradas do clube são dinheiro recebido neste fechamento; repasses indicam pagamentos registrados. Resultado gerencial não é lucro bancário definitivo e não inclui custódia anterior de Pix do clube.',
        ];
    }

    public function detalhe(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$p=$this->getPeriod($db,(int)$id,$actor);
        if($p instanceof ResponseInterface)return $p;
        $data=$this->resumo($db,$p);
        return $this->response->setJSON(['fechamento'=>$data])->setHeader('Cache-Control','no-store');
    }

    private function editable($db,int $id,array $actor,string $stage): array|ResponseInterface
    {
        $p=$this->getPeriod($db,$id,$actor,true);
        if($p instanceof ResponseInterface)return $p;
        if($p['status']!==$stage)return $this->errorResponse(409,'Fechamento está em outra etapa ou já foi concluído.');
        return $p;
    }

    private function allowedMethod($db,int $id): bool
    {
        return $db->table('venda_formas_pagamento')
            ->where('id',$id)->where('ativo',1)
            ->where('codigo !=','ABATIMENTO_EMP')->countAllResults()>0;
    }

    /** Requisição única por tentativa; lançamentos duplicados não entram duas vezes. */
    private function registrarChave($db,int $period,string $type,mixed $raw): ?bool
    {
        if(!is_string($raw)||!preg_match('/^[A-Za-z0-9_-]{16,64}$/D',$raw))return null;
        if($db->table('fechamento_periodo_eventos')
            ->where('fechamento_id',$period)->where('chave_requisicao',$raw)->countAllResults()){
            return false;
        }
        $db->table('fechamento_periodo_eventos')->insert([
            'fechamento_id'=>$period,'chave_requisicao'=>$raw,
            'tipo'=>$type,'criado_em'=>$this->now(),
        ]);
        return true;
    }

    /** Parte própria disponível por venda, abatidos todos os rateios e pagamentos anteriores. */
    private function titularDisponivel($db,int $periodId,int $personId,bool $lock=false): array
    {
        $rows=$db->table('fechamento_periodo_vendas f')
            ->select('v.id,v.data_venda,v.corretor_pessoa_id,v.comissao_prevista,v.comissao_ajustada')
            ->join('venda_operacoes v','v.id=f.operacao_id')
            ->where('f.fechamento_id',$periodId)
            ->where('v.corretor_pessoa_id',$personId)
            ->orderBy('v.data_venda')->orderBy('v.id')->get()->getResultArray();
        if(!$rows)return [];
        $ids=array_map(static fn($x)=>(int)$x['id'],$rows);
        if($lock){
            $locked=$ids;sort($locked,SORT_NUMERIC);
            foreach($locked as $id)$db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[$id])->getRowArray();
        }
        $byRateio=[];
        foreach($db->table('comissao_rateios')->select('operacao_id,responsavel_pessoa_id,valor')
            ->whereIn('operacao_id',$ids)->where('responsavel_pessoa_id',$personId)->get()->getResultArray() as $r){
            $id=(int)$r['operacao_id'];
            $byRateio[$id]=($byRateio[$id]??0)+VendaMoney::cents((string)$r['valor'],true);
        }
        $byPaid=[];
        foreach($db->table('comissao_titular_movimentos')->select('operacao_id,tipo,valor')
            ->whereIn('operacao_id',$ids)->where('corretor_pessoa_id',$personId)->get()->getResultArray() as $r){
            $id=(int)$r['operacao_id'];
            $byPaid[$id]=($byPaid[$id]??0)
                +($r['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$r['valor'],true);
        }
        $result=[];
        foreach($rows as $row){
            $id=(int)$row['id'];
            $value=$row['comissao_ajustada']??$row['comissao_prevista'];
            if($value===null)continue;
            $due=VendaMoney::cents((string)$value,true)-($byRateio[$id]??0)-($byPaid[$id]??0);
            if($due>0)$result[]=['operacao_id'=>$id,'saldo'=>$due];
        }
        return $result;
    }

    /** Registra a comissão PRÓPRIA; não é uma segunda participação de atendente. */
    private function registrarMovimentosTitular($db,int $periodId,int $personId,array $forms,
        string $date,int $userId,?int $lotId=null): void
    {
        $available=$this->titularDisponivel($db,$periodId,$personId,true);
        $total=array_sum(array_column($forms,'cents'));
        if($total<=0||$total>array_sum(array_column($available,'saldo'))){
            throw new \DomainException('Pagamento maior que a comissão própria pendente deste corretor.');
        }
        foreach($forms as $form){
            $left=$form['cents'];
            foreach($available as &$row){
                if(!$left)break;
                $value=min($left,$row['saldo']);
                if(!$value)continue;
                $db->table('comissao_titular_movimentos')->insert([
                    'operacao_id'=>$row['operacao_id'],
                    'corretor_pessoa_id'=>$personId,
                    'tipo'=>'PAGAMENTO','referencia_pagamento_id'=>null,
                    'valor'=>VendaMoney::decimal($value),'data_pagamento'=>$date,
                    'observacoes'=>'Comissão própria no fechamento #'.$periodId,
                    'lote_id'=>$lotId,'forma_id'=>$form['id'],
                    'criado_por_usuario_id'=>$userId,'criado_em'=>$this->now(),
                ]);
                $movId=(int)$db->insertID();
                $db->table('fechamento_periodo_titulares')->insert([
                    'fechamento_id'=>$periodId,
                    'operacao_id'=>$row['operacao_id'],
                    'movimento_id'=>$movId,'forma_id'=>$form['id'],
                    'valor'=>VendaMoney::decimal($value),'situacao'=>'ATIVO',
                ]);
                $row['saldo']-=$value;$left-=$value;
            }
            unset($row);
        }
    }

    public function receber(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $data=$this->jsonPayload();
        $person=$this->optionalId($data['corretor_pessoa_id']??null);
        $method=$this->optionalId($data['forma_id']??null);
        $amount=$this->cents($data['valor']??null);
        $date=(string)($data['data_recebimento']??'');
        $note=$this->cleanText($data['observacoes']??null,500);
        if(!$person||!$method||!$amount||!$this->validateDate($date,false)||$note===false)
            return $this->errorResponse(422,'Informe corretor, forma, valor e data do recebimento.');
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'RECEBIMENTOS');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            if(!$db->table('fechamento_periodo_pessoas')->where('fechamento_id',(int)$id)
                ->where('pessoa_id',$person)->countAllResults()||!$this->allowedMethod($db,$method)){
                $db->transRollback();return $this->errorResponse(422,'Pessoa fora do grupo ou forma inválida.');
            }
            $claimed=$this->registrarChave($db,(int)$id,'ENTRADA',$data['chave_requisicao']??null);
            if($claimed===null){
                $db->transRollback();return $this->errorResponse(422,'Chave única do lançamento é obrigatória.');
            }
            if($claimed===false){
                $db->transRollback();return $this->responseOK('Lançamento já registrado; nenhuma duplicação.',200,['duplicado'=>true]);
            }
            $db->table('fechamento_periodo_entradas')->insert([
                'fechamento_id'=>(int)$id,'corretor_pessoa_id'=>$person,
                'forma_id'=>$method,'valor'=>VendaMoney::decimal($amount),
                'data_recebimento'=>$date,'observacoes'=>$note,
                'criado_por_usuario_id'=>$actor['usuario_id'],'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Recebimento do clube registrado separadamente da comissão.',200);
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'entrada de fechamento');}
    }

    public function excluirEntrada(int|string $id,int|string $entryId): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'RECEBIMENTOS');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $db->table('fechamento_periodo_entradas')->where('id',(int)$entryId)
                ->where('fechamento_id',(int)$id)->delete();
            $this->commitOrFail($db);
            return $this->responseOK('Rascunho de recebimento retirado antes da apuração.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'retirar entrada rascunho');}
    }

    public function abater(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $data=$this->jsonPayload();
        $loanId=$this->optionalId($data['emprestimo_id']??null);
        $amount=$this->cents($data['valor']??null);
        $date=(string)($data['data_abate']??'');
        if(!$loanId||!$amount||!$this->validateDate($date,false))
            return $this->errorResponse(422,'Informe empréstimo, valor e data do abatimento.');
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'RECEBIMENTOS');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $loan=$db->query('SELECT * FROM financeiro_emprestimos WHERE id=? FOR UPDATE',[$loanId])->getRowArray();
            if(!$loan||$loan['situacao']!=='ATIVO'||!$db->table('fechamento_periodo_pessoas')
                ->where('fechamento_id',(int)$id)->where('pessoa_id',(int)$loan['pessoa_id'])->countAllResults()){
                $db->transRollback();return $this->errorResponse(422,'Empréstimo não pertence a este fechamento.');
            }
            $paid=0;
            foreach($db->table('financeiro_emprestimo_abates')->select('valor')
                ->where('emprestimo_id',$loanId)->get()->getResultArray() as $r)$paid+=VendaMoney::cents((string)$r['valor'],true);
            if($amount>VendaMoney::cents((string)$loan['valor'],true)-$paid){
                $db->transRollback();return $this->errorResponse(422,'Abatimento supera o saldo da dívida.');
            }
            $claimed=$this->registrarChave($db,(int)$id,'ABATE',$data['chave_requisicao']??null);
            if($claimed===null){
                $db->transRollback();return $this->errorResponse(422,'Chave única do lançamento é obrigatória.');
            }
            if($claimed===false){
                $db->transRollback();return $this->responseOK('Lançamento já registrado; nenhuma duplicação.',200,['duplicado'=>true]);
            }
            $db->table('comissao_lotes_pagamento')->insert([
                'pessoa_id'=>(int)$loan['pessoa_id'],
                'periodo_inicio'=>$p['inicio'],'periodo_fim'=>$p['fim'],
                'data_pagamento'=>$date,
                'valor_total'=>VendaMoney::decimal($amount),'valor_transferido'=>'0.00',
                'valor_abate'=>VendaMoney::decimal($amount),
                'observacoes'=>'Abatimento de empréstimo no fechamento #'.$id.' (sem transferência).',
                'chave_requisicao'=>'FEEMP_'.$id.'_'.$loanId.'_'.bin2hex(random_bytes(8)),
                'criado_por_usuario_id'=>$actor['usuario_id'],'criado_em'=>$this->now(),
            ]);
            $lotId=(int)$db->insertID();
            // A amortização também quita uma parcela da comissão PRÓPRIA,
            // registrada com forma interna, sem contar como dinheiro físico.
            $internal=$db->table('venda_formas_pagamento')
                ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
            if(!$internal){
                $db->transRollback();return $this->errorResponse(409,'Meio interno de abatimento não encontrado.');
            }
            try{
                $this->registrarMovimentosTitular($db,(int)$id,(int)$loan['pessoa_id'],
                    [['id'=>(int)$internal['id'],'cents'=>$amount]],
                    $date,$actor['usuario_id'],$lotId);
            }catch(DomainException $e){
                $db->transRollback();return $this->errorResponse(422,
                    'O abatimento precisa ser coberto pela comissão própria pendente. '.$e->getMessage());
            }
            $db->table('financeiro_emprestimo_abates')->insert([
                'emprestimo_id'=>$loanId,'lote_id'=>$lotId,
                'valor'=>VendaMoney::decimal($amount),'data_abate'=>$date,
                'criado_por_usuario_id'=>$actor['usuario_id'],'criado_em'=>$this->now(),
            ]);
            $db->table('fechamento_periodo_abates')->insert([
                'fechamento_id'=>(int)$id,'emprestimo_id'=>$loanId,
                'lote_id'=>$lotId,'valor'=>VendaMoney::decimal($amount),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Dívida abatida somente da pessoa vinculada ao empréstimo.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'abatimento de fechamento');}
    }

    public function desfazerAbate(int|string $id,int|string $abatimentoId): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'RECEBIMENTOS');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $entry=$db->table('fechamento_periodo_abates')->where('id',(int)$abatimentoId)
                ->where('fechamento_id',(int)$id)->get()->getRowArray();
            if(!$entry){$db->transRollback();return $this->errorResponse(404,'Abatimento não encontrado.');}
            $db->query('SELECT id FROM financeiro_emprestimos WHERE id=? FOR UPDATE',[(int)$entry['emprestimo_id']])->getRowArray();
            $related=$db->table('comissao_titular_movimentos')->select('id')
                ->where('lote_id',(int)$entry['lote_id'])->get()->getResultArray();
            foreach($related as $m){
                $db->table('fechamento_periodo_titulares')->where('movimento_id',(int)$m['id'])
                    ->where('fechamento_id',(int)$id)->delete();
            }
            $db->table('comissao_titular_movimentos')->where('lote_id',(int)$entry['lote_id'])->delete();
            $db->table('fechamento_periodo_abates')->where('id',(int)$abatimentoId)->delete();
            $db->table('financeiro_emprestimo_abates')->where('emprestimo_id',(int)$entry['emprestimo_id'])
                ->where('lote_id',(int)$entry['lote_id'])->delete();
            $db->table('comissao_lotes_pagamento')->where('id',(int)$entry['lote_id'])->delete();
            $this->commitOrFail($db);
            return $this->responseOK('Rascunho de abatimento desfeito; saldo do empréstimo restaurado.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'desfazer abatimento em rascunho');}
    }

    public function voltar(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            if($db->table('fechamento_periodo_repasses')->where('fechamento_id',(int)$id)
                ->where('situacao','ATIVO')->countAllResults()
                ||$db->table('fechamento_periodo_titulares')->where('fechamento_id',(int)$id)
                    ->where('situacao','ATIVO')->countAllResults()){
                $db->transRollback();return $this->errorResponse(409,'Já foram registrados repasses. Conclua ou estorne os pagamentos antes de voltar.');
            }
            $db->table('fechamento_periodos')->where('id',(int)$id)->update(['status'=>'RECEBIMENTOS']);
            $this->commitOrFail($db);
            return $this->responseOK('Voltou à etapa de recebimentos para conferência.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'voltar etapa de recebimento');}
    }

    public function avancar(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'RECEBIMENTOS');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $db->table('fechamento_periodos')->where('id',(int)$id)->update(['status'=>'REPASSES']);
            $this->commitOrFail($db);
            return $this->responseOK('Recebimentos conferidos. Agora registre os repasses reais.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'avançar fechamento');}
    }

    public function pagar(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $data=$this->jsonPayload();
        $payee=$this->optionalId($data['beneficiario_pessoa_id']??null);
        $date=(string)($data['data_pagamento']??'');
        $formas=$data['formas']??[];
        if(!$payee||!$this->validateDate($date,false)||!is_array($formas)
            ||count($formas)<1||count($formas)>8)return $this->errorResponse(422,'Informe beneficiário, data e formas de pagamento.');
        $payments=[];$total=0;
        foreach($formas as $item){
            if(!is_array($item))return $this->errorResponse(422,'Forma inválida.');
            $fid=$this->optionalId($item['forma_id']??null);
            $c=$this->cents($item['valor']??null);
            if(!$fid||!$c)return $this->errorResponse(422,'Pagamento deve ter forma e valor positivo.');
            $payments[]=['id'=>$fid,'cents'=>$c];$total+=$c;
        }
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            foreach($payments as $payment)if(!$this->allowedMethod($db,$payment['id'])){
                $db->transRollback();return $this->errorResponse(422,'Forma inativa ou interna não pode ser usada.');
            }
            $saleIds=array_map(static fn($r)=>(int)$r['operacao_id'],
                $db->table('fechamento_periodo_vendas')->select('operacao_id')
                    ->where('fechamento_id',(int)$id)->get()->getResultArray());
            if(!$saleIds){
                $db->transRollback();return $this->errorResponse(409,'Não existem vendas neste fechamento.');
            }
            sort($saleIds,SORT_NUMERIC);
            foreach($saleIds as $sid)$db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[$sid])->getRowArray();
            $group=array_map(static fn($r)=>(int)$r['pessoa_id'],
                $db->table('fechamento_periodo_pessoas')->select('pessoa_id')
                    ->where('fechamento_id',(int)$id)->get()->getResultArray());
            $rs=$db->table('comissao_rateios r')
                ->select('r.id,r.operacao_id,r.valor,v.data_venda')
                ->join('venda_operacoes v','v.id=r.operacao_id')
                ->whereIn('r.operacao_id',$saleIds)
                ->whereIn('r.responsavel_pessoa_id',$group)
                ->where('r.beneficiario_pessoa_id',$payee)
                ->orderBy('v.data_venda')->orderBy('r.id')->get()->getResultArray();
            if(!$rs){
                $db->transRollback();return $this->errorResponse(404,'Beneficiário não possui participação neste fechamento.');
            }
            $rateIds=array_map(static fn($r)=>(int)$r['id'],$rs);
            $already=[];
            foreach($db->table('comissao_repasses')->select('rateio_id,tipo,valor')
                ->whereIn('rateio_id',$rateIds)->get()->getResultArray() as $m){
                $rid=(int)$m['rateio_id'];
                $already[$rid]=($already[$rid]??0)+($m['tipo']==='PAGAMENTO'?1:-1)
                    *VendaMoney::cents((string)$m['valor'],true);
            }
            $available=[];
            foreach($rs as $r){
                $due=VendaMoney::cents((string)$r['valor'],true)-($already[(int)$r['id']]??0);
                if($due>0)$available[]=['id'=>(int)$r['id'],'pendente'=>$due];
            }
            if($total>array_sum(array_column($available,'pendente'))){
                $db->transRollback();return $this->errorResponse(422,'Pagamento maior que o total pendente ao participante.');
            }
            $claimed=$this->registrarChave($db,(int)$id,'REPASSE',$data['chave_requisicao']??null);
            if($claimed===null){
                $db->transRollback();return $this->errorResponse(422,'Chave única do lançamento é obrigatória.');
            }
            if($claimed===false){
                $db->transRollback();return $this->responseOK('Lançamento já registrado; nenhuma duplicação.',200,['duplicado'=>true]);
            }
            $now=$this->now();
            foreach($payments as $payment){
                $left=$payment['cents'];
                foreach($available as &$a){
                    if(!$left)break;
                    $take=min($left,$a['pendente']);
                    if(!$take)continue;
                    $db->table('comissao_repasses')->insert([
                        'rateio_id'=>$a['id'],'tipo'=>'PAGAMENTO',
                        'referencia_pagamento_id'=>null,
                        'valor'=>VendaMoney::decimal($take),
                        'data_pagamento'=>$date,
                        'observacoes'=>'Repasse no fechamento #'.$id,
                        'forma_id'=>$payment['id'],'lote_id'=>null,
                        'criado_por_usuario_id'=>$actor['usuario_id'],'criado_em'=>$now,
                    ]);
                    $movementId=(int)$db->insertID();
                    $db->table('fechamento_periodo_repasses')->insert([
                        'fechamento_id'=>(int)$id,
                        'rateio_id'=>$a['id'],'movimento_id'=>$movementId,
                        'forma_id'=>$payment['id'],'valor'=>VendaMoney::decimal($take),
                    ]);
                    $a['pendente']-=$take;$left-=$take;
                }
                unset($a);
            }
            $this->commitOrFail($db);
            return $this->responseOK('Repasse confirmado e distribuído nas vendas desta pessoa.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'repasse do fechamento');}
    }

    /** Um pagamento errado vira ESTORNO: não apaga o lançamento nem mexe no outro corretor. */
    public function pagarTitular(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $data=$this->jsonPayload();
        $person=$this->optionalId($data['corretor_pessoa_id']??null);
        $date=(string)($data['data_pagamento']??'');
        $forms=$data['formas']??null;
        if(!$person||!$this->validateDate($date,false)||!is_array($forms)
            ||count($forms)<1||count($forms)>8)return $this->errorResponse(422,'Corretor, data e formas são obrigatórios.');
        $normalized=[];
        foreach($forms as $f){
            if(!is_array($f))return $this->errorResponse(422,'Forma inválida.');
            $fid=$this->optionalId($f['forma_id']??null);
            $v=$this->cents($f['valor']??null);
            if(!$fid||!$v)return $this->errorResponse(422,'Informe forma e valor positivo.');
            $normalized[]=['id'=>$fid,'cents'=>$v];
        }
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            if(!$db->table('fechamento_periodo_pessoas')->where('fechamento_id',(int)$id)
                ->where('pessoa_id',$person)->countAllResults()){
                $db->transRollback();return $this->errorResponse(403,'Corretor fora deste fechamento.');
            }
            foreach($normalized as $n)if(!$this->allowedMethod($db,$n['id'])){
                $db->transRollback();return $this->errorResponse(422,'Forma de pagamento não permitida.');
            }
            $claimed=$this->registrarChave($db,(int)$id,'TITULAR',$data['chave_requisicao']??null);
            if($claimed===null){$db->transRollback();return $this->errorResponse(422,'Chave do pagamento é obrigatória.');}
            if($claimed===false){$db->transRollback();return $this->responseOK('Pagamento já registrado, sem duplicar.',200,['duplicado'=>true]);}
            try{
                $this->registrarMovimentosTitular($db,(int)$id,$person,$normalized,$date,$actor['usuario_id']);
            }catch(\DomainException $e){
                $db->transRollback();return $this->errorResponse(422,$e->getMessage());
            }
            $this->commitOrFail($db);
            return $this->responseOK('Comissão própria do corretor paga e lançada no extrato individual.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'pagar titular por fechamento');}
    }

    public function estornarTitular(int|string $id,int|string $entryId): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $reason=$this->cleanText($this->jsonPayload()['justificativa']??null,500,true);
        if($reason===false||mb_strlen((string)$reason)<5)return $this->errorResponse(422,'Informe justificativa de estorno.');
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $entry=$db->table('fechamento_periodo_titulares')
                ->where('id',(int)$entryId)->where('fechamento_id',(int)$id)->get()->getRowArray();
            if(!$entry){$db->transRollback();return $this->errorResponse(404,'Pagamento não encontrado.');}
            $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$entry['operacao_id']])->getRowArray();
            $entry=$db->table('fechamento_periodo_titulares')->where('id',(int)$entryId)->get()->getRowArray();
            if($entry['situacao']!=='ATIVO'){
                $db->transRollback();return $this->errorResponse(409,'Pagamento já estornado.');
            }
            $internal=$db->table('venda_formas_pagamento')
                ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
            if($internal&&(int)$internal['id']===(int)$entry['forma_id']){
                $db->transRollback();
                return $this->errorResponse(409,'Abatimento de empréstimo é corrigido na etapa de recebimentos, não por estorno isolado.');
            }
            $sale=$db->table('venda_operacoes')->select('corretor_pessoa_id')
                ->where('id',(int)$entry['operacao_id'])->get()->getRowArray();
            $db->table('comissao_titular_movimentos')->insert([
                'operacao_id'=>(int)$entry['operacao_id'],
                'corretor_pessoa_id'=>(int)$sale['corretor_pessoa_id'],
                'tipo'=>'ESTORNO','referencia_pagamento_id'=>(int)$entry['movimento_id'],
                'valor'=>$entry['valor'],'data_pagamento'=>substr($this->now(),0,10),
                'observacoes'=>$reason,'forma_id'=>(int)$entry['forma_id'],
                'lote_id'=>null,'criado_por_usuario_id'=>$actor['usuario_id'],
                'criado_em'=>$this->now(),
            ]);
            $db->table('fechamento_periodo_titulares')->where('id',(int)$entryId)
                ->update(['situacao'=>'ESTORNADO']);
            $this->commitOrFail($db);
            return $this->responseOK('Pagamento do corretor estornado e comissão reaberta.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'estornar titular do fechamento');}
    }

    public function estornarRepasse(int|string $id,int|string $entryId): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $body=$this->jsonPayload();
        $reason=$this->cleanText($body['justificativa']??null,500,true);
        if($reason===false||mb_strlen((string)$reason)<5)
            return $this->errorResponse(422,'Justifique o estorno em ao menos cinco caracteres.');
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $entry=$db->table('fechamento_periodo_repasses f')
                ->select('f.*,r.operacao_id')
                ->join('comissao_rateios r','r.id=f.rateio_id')
                ->where('f.fechamento_id',(int)$id)->where('f.id',(int)$entryId)
                ->get()->getRowArray();
            if(!$entry){$db->transRollback();return $this->errorResponse(404,'Repasse não encontrado.');}
            $db->query('SELECT id FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$entry['operacao_id']])->getRowArray();
            $entry=$db->table('fechamento_periodo_repasses')->where('id',(int)$entryId)->get()->getRowArray();
            if($entry['situacao']!=='ATIVO'){
                $db->transRollback();return $this->errorResponse(409,'Repasse já estornado.');
            }
            $db->table('comissao_repasses')->insert([
                'rateio_id'=>(int)$entry['rateio_id'],'tipo'=>'ESTORNO',
                'referencia_pagamento_id'=>(int)$entry['movimento_id'],
                'valor'=>$entry['valor'],
                'data_pagamento'=>substr($this->now(),0,10),
                'observacoes'=>$reason,'forma_id'=>(int)$entry['forma_id'],
                'lote_id'=>null,'criado_por_usuario_id'=>$actor['usuario_id'],
                'criado_em'=>$this->now(),
            ]);
            $db->table('fechamento_periodo_repasses')->where('id',(int)$entryId)
                ->update(['situacao'=>'ESTORNADO']);
            $this->commitOrFail($db);
            return $this->responseOK('Pagamento estornado com histórico; voltou a ficar pendente.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'estornar repasse do fechamento');}
    }

    public function concluir(int|string $id): ResponseInterface
    {
        $actor=$this->acesso();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();$db->transBegin();
        try{
            $p=$this->editable($db,(int)$id,$actor,'REPASSES');
            if($p instanceof ResponseInterface){$db->transRollback();return $p;}
            $p['responsavel_nome']=$db->table('pessoas')->select('nome')
                ->where('id',(int)$p['responsavel_pessoa_id'])->get()->getRow('nome');
            $report=$this->resumo($db,$p);
            $report['status']='CONCLUIDO';$report['concluido_em']=$this->now();
            $db->table('fechamento_periodos')->where('id',(int)$id)->update([
                'status'=>'CONCLUIDO','concluido_em'=>$report['concluido_em'],
                'resumo_concluido'=>json_encode($report,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Fechamento concluído; histórico preservado e imutável.',200);
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'concluir fechamento');}
    }
}
