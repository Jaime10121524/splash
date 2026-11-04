<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Indicadores objetivos para o início do app. Todas as consultas aplicam
 * o mesmo escopo de corretores usado nas operações e nos atendimentos.
 * Comissão e repasses de terceiros nunca são entregues neste endpoint.
 */
final class MobileDashboardController extends BaseController
{
    public function index(): ResponseInterface
    {
        $user=auth('tokens')->user();
        if(!$user||$user->isBanned())
            return $this->response->setStatusCode(401)->setJSON(['message'=>'Sessão expirada.']);
        if(!$user->inGroup('admin','gerente','operador','corretor'))
            return $this->response->setStatusCode(403)->setJSON(['message'=>'Sem acesso aos indicadores comerciais.']);

        $range=(string)($this->request->getGet('dias')??'7');
        if(!in_array($range,['1','7','30'],true))
            return $this->response->setStatusCode(422)->setJSON(['message'=>'Período inválido.']);
        $days=(int)$range;
        $db=db_connect();
        $scope=null;
        if($user->inGroup('corretor')&&!$user->inGroup('admin','gerente','operador')){
            $person=$db->table('pessoas')->select('id')->where('user_id',(int)$user->id)
                ->where('ativo',1)->get()->getRowArray();
            if(!$person)
                return $this->response->setStatusCode(403)
                    ->setJSON(['message'=>'Conta sem corretor ativo vinculado.']);
            $scope=(int)$person['id'];
        }
        $start=date('Y-m-d',strtotime('-'.($days-1).' days'));
        $end=date('Y-m-d');
        $visitQuery=static function () use ($db,$scope,$user,$start,$end){
            $q=$db->table('visitas v')
                ->where('v.chegada_em >=',$start.' 00:00:00')
                ->where('v.chegada_em <=',$end.' 23:59:59');
            if($scope!==null)$q->groupStart()
                ->where('v.corretor_pessoa_id',$scope)
                ->orWhere('v.segundo_corretor_pessoa_id',$scope)
                ->orWhere('v.criado_por_usuario_id',(int)$user->id)->groupEnd();
            return $q;
        };
        $visitStats=$visitQuery()->select("
            COUNT(*) AS total,
            SUM(CASE WHEN v.status='AGUARDANDO' THEN 1 ELSE 0 END) AS aguardando,
            SUM(CASE WHEN v.status='ATENDENDO' THEN 1 ELSE 0 END) AS atendendo,
            SUM(CASE WHEN v.status='VENDA' THEN 1 ELSE 0 END) AS venda,
            SUM(CASE WHEN v.status='PENDENCIA' THEN 1 ELSE 0 END) AS pendencia,
            SUM(CASE WHEN v.status='RETORNO' THEN 1 ELSE 0 END) AS retorno,
            SUM(CASE WHEN v.status='SEM_VENDA' THEN 1 ELSE 0 END) AS sem_venda,
            SUM(CASE WHEN v.status='CANCELADA' THEN 1 ELSE 0 END) AS canceladas
        ",false)->get()->getRowArray()??[];
        $recentVisits=$visitQuery()
            ->select('v.id,v.cliente_id,v.status,v.chegada_em,v.inicio_em,v.fim_em,
                v.retorno_previsto,v.observacoes,c.nome AS cliente_nome,c.telefone AS cliente_telefone,
                p.nome AS atendente_nome,cp.nome AS corretor_nome')
            ->join('clientes c','c.id=v.cliente_id')
            ->join('pessoas p','p.id=v.atendente_pessoa_id','left')
            ->join('pessoas cp','cp.id=v.corretor_pessoa_id','left')
            ->orderBy('v.chegada_em','DESC')->limit(4)->get()->getResultArray();

        $salesQuery=static function()use($db,$scope,$user,$start,$end){
            $q=$db->table('venda_operacoes o')
                ->join('visitas v','v.id=o.visita_id','left')
                ->where('o.situacao','VENDA')
                ->where('o.data_venda >=',$start)
                ->where('o.data_venda <=',$end);
            if($scope!==null)$q->groupStart()
                ->where('o.corretor_pessoa_id',$scope)
                ->orWhere('o.segundo_corretor_pessoa_id',$scope)
                ->orWhere('v.criado_por_usuario_id',(int)$user->id)->groupEnd()
                ->where('o.visita_id IS NOT NULL',null,false);
            return $q;
        };
        $salesStats=$salesQuery()->select('COUNT(*) AS total, COALESCE(SUM(o.valor_cobrado),0) AS valor',false)
            ->get()->getRowArray()??[];
        $daily=$salesQuery()->select('o.data_venda AS data,COUNT(*) AS total',false)
            ->groupBy('o.data_venda')->orderBy('o.data_venda','ASC')->get()->getResultArray();
        $byDate=[];
        foreach($daily as $row)$byDate[substr((string)$row['data'],0,10)]=(int)$row['total'];
        $series=[];
        for($n=$days-1;$n>=0;$n--){
            $d=date('Y-m-d',strtotime('-'.$n.' days'));
            $series[]=['data'=>$d,'quantidade'=>$byDate[$d]??0];
        }
        $finished=(int)($visitStats['venda']??0)+(int)($visitStats['sem_venda']??0)
            +(int)($visitStats['retorno']??0)+(int)($visitStats['pendencia']??0);
        $unread=$db->table('splash_notificacoes')
            ->where('user_id',(int)$user->id)->where('lido_em',null)->countAllResults();
        $latest=$db->table('splash_notificacoes')
            ->select('id,titulo,mensagem,categoria,rota,chave_evento,criado_em')
            ->where('user_id',(int)$user->id)
            ->orderBy('id','DESC')->limit(3)->get()->getResultArray();

        return $this->response->setJSON([
            'periodo_dias'=>$days,
            'visitas'=>[
                'total'=>(int)($visitStats['total']??0),
                'aguardando'=>(int)($visitStats['aguardando']??0),
                'atendendo'=>(int)($visitStats['atendendo']??0),
                'venda'=>(int)($visitStats['venda']??0),
                'pendencia'=>(int)($visitStats['pendencia']??0),
                'retorno'=>(int)($visitStats['retorno']??0),
                'sem_venda'=>(int)($visitStats['sem_venda']??0),
                'canceladas'=>(int)($visitStats['canceladas']??0),
                'concluidos'=>$finished,
            ],
            'vendas'=>[
                'total'=>(int)($salesStats['total']??0),
                // Somente admin recebe total financeiro consolidado.
                'valor'=>$user->inGroup('admin')?(string)($salesStats['valor']??'0'):null,
                'serie'=>$series,
            ],
            'taxa_conversao'=>$finished>0
                ?round((int)($visitStats['venda']??0)*100/$finished,1):0,
            'recentes'=>$recentVisits,
            'notificacoes'=>['nao_lidas'=>(int)$unread,'ultimas'=>$latest],
        ])->setHeader('Cache-Control','private, no-store');
    }
}
