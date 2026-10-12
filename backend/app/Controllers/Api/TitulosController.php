<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VigenciaTitulo;
use App\Libraries\VendaMoney;
use App\Libraries\ComissaoAutomatica;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;
use InvalidArgumentException;

/** Carteira de títulos e novas operações financeiras de renovação / upgrade. */
final class TitulosController extends CommercialBaseController
{
    private function actor(): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        $admin=$user->inGroup('admin') && $user->can('sales.all');
        if(!$admin && (!$user->inGroup('corretor') || !$user->can('sales.own'))){
            return $this->errorResponse(403,'Sem permissão para consultar títulos.');
        }
        $person=null;
        if(!$admin){
            $person=db_connect()->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if(!$person)return $this->errorResponse(403,'Pessoa ativa não vinculada.');
        }
        return ['admin'=>$admin,'user_id'=>(int)$user->id,
            'pessoa_id'=>$person?(int)$person['id']:null];
    }

    private function admin(): ?ResponseInterface
    {
        return $this->authorizeAdmin();
    }

    private function clienteQuitou($db,array $sale): bool
    {
        $total=0;
        foreach($db->table('venda_recebimentos')->select('tipo,valor')
            ->where('operacao_id',(int)$sale['id'])->get()->getResultArray() as $m){
            $amount=VendaMoney::cents((string)$m['valor'],true);
            $total+=($m['tipo']==='ENTRADA'?1:-1)*$amount;
        }
        return $total===VendaMoney::cents((string)$sale['valor_cobrado'],true);
    }

    private function validatePerson($db,$raw,string $role,bool $optional=true): ?int
    {
        if($raw===null || $raw===''){
            if($optional)return null;
            throw new InvalidArgumentException('Informe o corretor responsável.');
        }
        $id=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($id===false)throw new InvalidArgumentException('Participante inválido.');
        $p=$db->table('pessoas')->where('id',(int)$id)->where('ativo',1)->countAllResults();
        $roles=$role==='atendente'?['vendedor','corretor']:[$role];
        $hasRole=$db->table('pessoa_papeis')->where('pessoa_id',(int)$id)
            ->whereIn('papel',$roles)->countAllResults();
        if(!$p || !$hasRole)throw new InvalidArgumentException('Participante sem função ativa correspondente: #'.$id);
        return (int)$id;
    }

    public function index(): ResponseInterface
    {
        $actor=$this->actor();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $query=$db->table('venda_operacoes v')
            ->select('v.id,v.cliente_id,v.numero_titulo,v.sigla_plano,v.data_inicio,v.data_vencimento,v.data_venda,v.prazo_meses,v.plano_versao_id,v.valor_tabela,v.valor_cobrado,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,v.gerente_pessoa_id,v.titulo_sequencia,pv.plano_id AS familia_plano_id,pv.valor AS preco_plano_atual,p.nome AS corretor_nome,c.nome AS cliente_nome,c.telefone AS cliente_telefone,lin.tipo AS movimento_origem,ante.data_vencimento AS vencimento_anterior')
            ->join('plano_versoes pv','pv.id=v.plano_versao_id')
            ->join('titulo_vinculos lout','lout.operacao_origem_id=v.id','left')
            ->join('titulo_vinculos lin','lin.operacao_nova_id=v.id','left')
            ->join('venda_operacoes ante','ante.id=lin.operacao_origem_id','left')
            ->join('pessoas p','p.id=v.corretor_pessoa_id')
            ->join('clientes c','c.id=v.cliente_id')
            ->where('v.situacao','VENDA')->where('lout.id IS NULL',null,false);
        if(!$actor['admin'])$query->where('v.corretor_pessoa_id',$actor['pessoa_id']);
        $q=trim((string)$this->request->getGet('q'));
        if($q!==''){
            $query->groupStart()->like('v.numero_titulo',$q)->orLike('v.sigla_plano',$q);
            if($actor['admin'])$query->orLike('c.nome',$q);
            $query->groupEnd();
        }
        $all=$query->orderBy('v.data_vencimento','ASC')->orderBy('v.id','DESC')->limit(300)
            ->get()->getResultArray();
        $paidBySale=[];
        if($all){
            $rows=$db->table('venda_recebimentos')
                ->select("operacao_id,COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN valor ELSE -valor END),0) AS recebido",false)
                ->whereIn('operacao_id',array_column($all,'id'))->groupBy('operacao_id')
                ->get()->getResultArray();
            foreach($rows as $row)$paidBySale[(int)$row['operacao_id']]=(string)$row['recebido'];
        }
        $now=\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateString();
        $limit=(new \DateTimeImmutable($now))->modify('+60 days')->format('Y-m-d');
        $items=[];$summary=['total'=>0,'ativos'=>0,'a_vencer'=>0,'vencidos'=>0,'a_quitar'=>0];
        foreach($all as $sale){
            $due=(string)$sale['data_vencimento'];
            $status=$due<$now?'VENCIDO':($due<=$limit?'A_VENCER':'ATIVO');
            $summary['total']++;
            $pending=!empty($sale['movimento_origem']) && 
                VendaMoney::cents((string)($paidBySale[(int)$sale['id']]??'0'),true)
                < VendaMoney::cents((string)$sale['valor_cobrado'],true);
            if($pending){
                $summary['a_quitar']++;
                $sale['status_titulo']='A_QUITAR';
                $sale['data_vencimento_vigente']=$sale['vencimento_anterior'];
                $sale['saldo_cobranca']=VendaMoney::decimal(max(0,
                    VendaMoney::cents((string)$sale['valor_cobrado'],true)
                    -VendaMoney::cents((string)($paidBySale[(int)$sale['id']]??'0'),true)));
            }else{
                $summary[$status==='VENCIDO'?'vencidos':($status==='A_VENCER'?'a_vencer':'ativos')]++;
                $sale['status_titulo']=$status;
                $sale['data_vencimento_vigente']=$due;
                $sale['saldo_cobranca']='0.00';
            }
            $sale['id']=(int)$sale['id'];
            if(!$actor['admin']){
                unset($sale['cliente_nome'],$sale['cliente_telefone'],$sale['cliente_id'],
                    $sale['valor_tabela'],$sale['valor_cobrado'],$sale['preco_plano_atual'],
                    $sale['saldo_cobranca'],
                    $sale['familia_plano_id'],$sale['plano_versao_id'],
                    $sale['segundo_corretor_pessoa_id'],$sale['atendente_pessoa_id'],
                    $sale['atendente_adicional_pessoa_id'],$sale['gerente_pessoa_id']);
            }
            $items[]=$sale;
        }
        return $this->response->setJSON([
            'titulos'=>$items,'resumo'=>$summary,
            'administrador'=>$actor['admin'],'limite'=>300,
        ])->setHeader('Cache-Control','no-store');
    }

    public function opcoes(): ResponseInterface
    {
        if($denied=$this->admin())return $denied;
        $db=db_connect();
        $planos=$db->table('plano_versoes v')
            ->select('v.id,v.plano_id,v.codigo,v.valor,v.duracao_meses,v.ativo')
            ->where('v.ativo',1)->orderBy('v.codigo')->get()->getResultArray();
        $pessoas=$db->table('pessoas p')->select('p.id,p.nome,pp.papel')
            ->join('pessoa_papeis pp','pp.pessoa_id=p.id')->where('p.ativo',1)
            ->orderBy('p.nome')->get()->getResultArray();
        return $this->response->setJSON(['planos'=>$planos,'pessoas'=>$pessoas])
            ->setHeader('Cache-Control','no-store');
    }

    public function historico(int|string $id): ResponseInterface
    {
        if($denied=$this->admin())return $denied;
        $db=db_connect();
        $sale=$db->table('venda_operacoes')->where('id',(int)$id)->get()->getRowArray();
        if(!$sale || $sale['situacao']!=='VENDA')return $this->errorResponse(404,'Título não encontrado.');
        $steps=[];$visited=[];
        for($n=0;$n<150;$n++){
            $sid=(int)$sale['id'];
            if(isset($visited[$sid]))return $this->errorResponse(409,'Histórico de título inconsistente.');
            $visited[$sid]=true;
            $link=$db->table('titulo_vinculos')->where('operacao_nova_id',$sid)->get()->getRowArray();
            $steps[]=[
                'operacao_id'=>$sid,'tipo'=>$link['tipo']??'ORIGINAL',
                'numero_titulo'=>$sale['numero_titulo'],'sigla_plano'=>$sale['sigla_plano'],
                'data_venda'=>$sale['data_venda'],'data_inicio'=>$sale['data_inicio'],
                'data_vencimento'=>$sale['data_vencimento'],
                'valor_cobrado'=>$sale['valor_cobrado'],
                'valor_tabela'=>$sale['valor_tabela'],
                'vencimento_anterior'=>$link['vencimento_anterior']??null,
                'preco_anterior'=>$link['preco_anterior']??null,
                'preco_novo'=>$link['preco_novo']??null,
                'justificativa'=>$link['justificativa']??null,
            ];
            if(!$link)break;
            $sale=$db->table('venda_operacoes')
                ->where('id',(int)$link['operacao_origem_id'])->get()->getRowArray();
            if(!$sale)return $this->errorResponse(409,'Operação anterior não encontrada.');
        }
        return $this->response->setJSON(['historico'=>array_reverse($steps)])
            ->setHeader('Cache-Control','no-store');
    }


    public function movimentar(int|string $id): ResponseInterface
    {
        if($denied=$this->admin())return $denied;
        $body=$this->jsonPayload();
        $kind=(string)($body['tipo']??'');
        $reason=$this->cleanText($body['justificativa']??null,500,true);
        $date=(string)($body['data_venda']??'');
        $versionId=$this->optionalId($body['plano_versao_id']??null);
        $discount=VendaMoney::cents((string)($body['desconto_corretor']??'0'),true);
        if(!in_array($kind,['RENOVACAO','UPGRADE'],true)||$reason===false
            ||mb_strlen((string)$reason)<5||!$this->validateDate($date,false)
            ||!$versionId||$discount===null){
            return $this->errorResponse(422,'Informe tipo, plano, data válida, desconto e justificativa (mínimo 5 caracteres).');
        }
        $db=db_connect();
        $db->transBegin();
        try{
            $source=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$source || $source['situacao']!=='VENDA' || !$source['data_vencimento']){
                $db->transRollback();
                return $this->errorResponse(404,'Título original inválido.');
            }
            if($db->table('titulo_vinculos')->where('operacao_origem_id',(int)$id)->countAllResults()){
                $db->transRollback();
                return $this->errorResponse(409,'Este título já foi renovado ou substituído. Selecione o título vigente.');
            }
            if($date<(string)$source['data_venda']){
                $db->transRollback();
                return $this->errorResponse(422,'O movimento não pode ter data anterior à venda original.');
            }
            if($kind==='UPGRADE' && $source['data_vencimento']<$date){
                $db->transRollback();
                return $this->errorResponse(409,'Título vencido: faça a renovação antes do upgrade.');
            }
            if(!$this->clienteQuitou($db,$source)){
                $db->transRollback();
                return $this->errorResponse(409,'Quite o saldo da venda original antes de renovar ou fazer upgrade.');
            }
            $version=$db->table('plano_versoes')->where('id',$versionId)->where('ativo',1)
                ->get()->getRowArray();
            $prevVersion=$db->table('plano_versoes')->where('id',$source['plano_versao_id'])
                ->get()->getRowArray();
            if(!$version || !$prevVersion){
                $db->transRollback();
                return $this->errorResponse(422,'Plano novo ou histórico do plano anterior inválido.');
            }
            if($kind==='RENOVACAO' && (int)$version['plano_id']!==(int)$prevVersion['plano_id']){
                $db->transRollback();
                return $this->errorResponse(422,'Renovação exige a mesma família de plano. Para mudar de categoria, use Upgrade.');
            }
            $root=$source;$visited=[];
            for($depth=0;$depth<150;$depth++){
                $rootId=(int)$root['id'];
                if(isset($visited[$rootId]))throw new \RuntimeException('Ciclo inválido no histórico.');
                $visited[$rootId]=true;
                $incoming=$db->table('titulo_vinculos')->where('operacao_nova_id',$rootId)
                    ->get()->getRowArray();
                if(!$incoming)break;
                $root=$db->table('venda_operacoes')->where('id',(int)$incoming['operacao_origem_id'])
                    ->get()->getRowArray();
                if(!$root)throw new \RuntimeException('Origem de título ausente.');
            }
            if($root===null || !$root['data_inicio'])throw new \RuntimeException('Vigência original não encontrada.');
            if($kind==='RENOVACAO'){
                $dates=VigenciaTitulo::renovar((string)$source['data_vencimento'],$date,(int)$version['duracao_meses']);
                $price=(string)$version['valor'];
            }else{
                $dates=VigenciaTitulo::upgrade((string)$root['data_inicio'],(string)$source['data_vencimento'],
                    (int)$version['duracao_meses'],(string)$prevVersion['valor'],(string)$version['valor']);
                $price=$dates['adicional'];
            }
            $money=VendaMoney::cents($price);
            if($money===null||$discount>=$money){
                $db->transRollback();
                return $this->errorResponse(422,'O desconto precisa ser inferior ao valor desta renovação/upgrade.');
            }
            $client=$db->table('clientes')->where('id',(int)$source['cliente_id'])->where('ativo',1)->get()->getRowArray();
            if(!$client){
                $db->transRollback();
                return $this->errorResponse(409,'Cliente desativado: não é possível movimentar o título.');
            }
            // Se não informado, o participante atual é preservado; ainda assim
            // verificamos papéis ativos porque o novo rateio será independente.
            $person=function(string $field,string $role,bool $required=false)use($body,$source,$db){
                $value=array_key_exists($field,$body)?$body[$field]:$source[$field];
                return $this->validatePerson($db,$value,$role,!$required);
            };
            $broker=$person('corretor_pessoa_id','corretor',true);
            $second=$person('segundo_corretor_pessoa_id','corretor');
            $attendant=$person('atendente_pessoa_id','atendente');
            $attendant2=$person('atendente_adicional_pessoa_id','atendente');
            $manager=$person('gerente_pessoa_id','gerente');
            if(($second!==null && $second===$broker)
                ||($attendant2!==null && $attendant2===$attendant)){
                $db->transRollback();
                return $this->errorResponse(422,'Segundo corretor/atendente precisa ser diferente do primeiro.');
            }
            $matching=$db->table('venda_operacoes')
                ->select('cliente_id,numero_titulo,sigla_plano,titulo_sequencia')
                ->where('numero_titulo',$source['numero_titulo'])
                ->where('sigla_plano',$version['codigo'])->get()->getResultArray();
            $sequence=VigenciaTitulo::sequencia($matching,(string)$source['numero_titulo'],
                (string)$version['codigo'],(int)$source['cliente_id']);
            $rules=ComissaoAutomatica::configs($db);
            $baseRule=$rules['AVISTA_ATUAL'];
            $now=\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
            $db->table('venda_operacoes')->insert([
                'cliente_id'=>(int)$source['cliente_id'],'visita_id'=>null,
                'plano_versao_id'=>(int)$version['id'],'situacao'=>'VENDA','historica'=>0,
                'numero_titulo'=>$source['numero_titulo'],'sigla_plano'=>$version['codigo'],
                'titulo_sequencia'=>$sequence,'prazo_meses'=>(int)$version['duracao_meses'],
                'valor_tabela'=>VendaMoney::decimal($money),
                'desconto_corretor'=>VendaMoney::decimal($discount),
                'valor_cobrado'=>VendaMoney::decimal($money-$discount),
                'regra_comissao_id'=>$baseRule['id'],
                'regra_snapshot'=>json_encode($baseRule,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                'regras_automaticas_snapshot'=>json_encode($rules,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                'comissao_prevista'=>null,
                'observacao_comissao'=>'Aguardando quitação da '.($kind==='RENOVACAO'?'renovação':'diferença do upgrade').' para apurar comissão.',
                'corretor_pessoa_id'=>$broker,'segundo_corretor_pessoa_id'=>$second,
                'dono_corrente_pessoa_id'=>(int)$source['dono_corrente_pessoa_id'],
                'atendente_pessoa_id'=>$attendant,'atendente_adicional_pessoa_id'=>$attendant2,
                'gerente_pessoa_id'=>$manager,
                'data_negociacao'=>$date,'data_venda'=>$date,
                'data_inicio'=>$dates['inicio'],'data_vencimento'=>$dates['vencimento'],
                'retorno_previsto'=>null,
                'observacoes'=>($kind==='RENOVACAO'?'Renovação':'Upgrade')
                    .' vinculado à operação #'.(int)$id.'. '.$reason,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$now,
            ]);
            $newId=(int)$db->insertID();
            if($newId<1)throw new \RuntimeException('Falha ao registrar venda vinculada.');
            $db->table('titulo_vinculos')->insert([
                'operacao_origem_id'=>(int)$id,'operacao_nova_id'=>$newId,
                'tipo'=>$kind,'vencimento_anterior'=>$source['data_vencimento'],
                'vencimento_novo'=>$dates['vencimento'],
                'preco_anterior'=>$prevVersion['valor'],'preco_novo'=>$version['valor'],
                'valor_adicional'=>VendaMoney::decimal($money),
                'justificativa'=>$reason,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$now,
            ]);
            if($db->transStatus()===false)throw new \RuntimeException('Falha de integridade da renovação/upgrade.');
            $this->commitOrFail($db);
            \App\Libraries\AvisosSplash::venda($newId);
            \App\Libraries\EnvioPushSplash::enviar(5);
            return $this->responseOK(($kind==='RENOVACAO'?'Renovação':'Upgrade')
                .' registrado. Receba o pagamento na nova venda; as comissões anteriores permanecem intactas.',
                201,['operacao_id'=>$newId,'valor_cobrado'=>VendaMoney::decimal($money-$discount),
                    'vencimento'=>$dates['vencimento']]);
        }catch(InvalidArgumentException $e){
            $db->transRollback();
            return $this->errorResponse(422,$e->getMessage());
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'movimentar título');
        }
    }

}
