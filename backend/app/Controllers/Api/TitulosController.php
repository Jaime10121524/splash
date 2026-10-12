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
            ->select('v.id,v.cliente_id,v.numero_titulo,v.sigla_plano,v.data_inicio,v.data_vencimento,v.data_venda,v.prazo_meses,v.plano_versao_id,v.valor_tabela,v.valor_cobrado,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,v.gerente_pessoa_id,v.titulo_sequencia,p.nome AS corretor_nome,c.nome AS cliente_nome,lin.tipo AS movimento_origem')
            ->join('titulo_vinculos lout','lout.operacao_origem_id=v.id','left')
            ->join('titulo_vinculos lin','lin.operacao_nova_id=v.id','left')
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
        $now=\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateString();
        $limit=(new \DateTimeImmutable($now))->modify('+60 days')->format('Y-m-d');
        $items=[];$summary=['total'=>0,'ativos'=>0,'a_vencer'=>0,'vencidos'=>0];
        foreach($all as $sale){
            $due=(string)$sale['data_vencimento'];
            $status=$due<$now?'VENCIDO':($due<=$limit?'A_VENCER':'ATIVO');
            $summary['total']++;
            $summary[$status==='VENCIDO'?'vencidos':($status==='A_VENCER'?'a_vencer':'ativos')]++;
            $sale['id']=(int)$sale['id'];
            $sale['status_titulo']=$status;
            if(!$actor['admin']){
                unset($sale['cliente_nome'],$sale['cliente_id'],
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

}
