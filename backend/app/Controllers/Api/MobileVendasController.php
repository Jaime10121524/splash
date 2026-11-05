<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * A venda web continua com sessão e CSRF. Esta camada autoriza token mobile,
 * aplica escopo de visita e reutiliza create/receber/detalhe/ajuste existentes.
 * Nunca aceita user_id ou corretor arbitrário para conceder acesso.
 */
final class MobileVendasController extends VendasController
{
    private function actor(): array|ResponseInterface
    {
        $u=auth('tokens')->user();
        if (!$u || $u->isBanned()) return $this->errorResponse(401,'Sua sessão expirou.');
        // Operador e vendedor não podem consultar pagamentos ou valores de vendas.
        if (!$u->inGroup('admin','gerente','corretor'))
            return $this->errorResponse(403,'Seu perfil não pode consultar ou registrar vendas comerciais.');
        $admin=$u->inGroup('admin');
        $manager=!$admin && $u->inGroup('gerente');
        $scope=null;
        if (!$admin) {
            $p=db_connect()->table('pessoas')->select('id')->where('user_id',(int)$u->id)
                ->where('ativo',1)->get()->getRowArray();
            if (!$p) return $this->errorResponse(403,'Conta sem pessoa ativa vinculada.');
            $scope=(int)$p['id'];
        }
        return ['user'=>$u,'admin'=>$admin,'manager'=>$manager,'scope'=>$scope];
    }

    protected function guard(): ?ResponseInterface
    {
        $a=$this->actor();
        return $a instanceof ResponseInterface?$a:null;
    }

    private function linkedVisit(int $id,array $a): array|ResponseInterface
    {
        $visit=db_connect()->table('visitas')->where('id',$id)->get()->getRowArray();
        if (!$visit || $visit['status']!=='VENDA') return $this->errorResponse(404,'Visita com venda fechada não encontrada.');
        if ($a['scope']!==null && !$a['manager'] && !in_array($a['scope'],[(int)$visit['corretor_pessoa_id'],(int)($visit['segundo_corretor_pessoa_id']??0)],true)
            && (int)$visit['criado_por_usuario_id']!==(int)$a['user']->id)
            return $this->errorResponse(404,'Visita não encontrada.');
        return $visit;
    }

    private function ownedOperation(int $id,array $a): array|ResponseInterface
    {
        $op=db_connect()->table('venda_operacoes')->where('id',$id)->get()->getRowArray();
        if (!$op) return $this->errorResponse(404,'Venda não encontrada.');
        if ($a['admin']) return $op;
        if ($a['manager']) {
            if ((int)($op['gerente_pessoa_id']??0)===$a['scope']
                || (int)($op['criado_por_usuario_id']??0)===(int)$a['user']->id) return $op;
            return $this->errorResponse(404,'Venda não encontrada entre as vendas da sua gestão.');
        }
        $visitId=(int)($op['visita_id']??0);
        if ($visitId<1) return $this->errorResponse(404,'Venda não encontrada.');
        $visit=$this->linkedVisit($visitId,$a);
        return $visit instanceof ResponseInterface?$visit:$op;
    }

    /** Filtros aplicados no servidor antes de paginar, preservando escopo e datas. */
    public function index():ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $db=db_connect();
        $planParam=(string)($this->request->getGet('plano')??'');
        $start=(string)($this->request->getGet('inicio')??'');
        $end=(string)($this->request->getGet('fim')??'');
        if($planParam!=='' && (!ctype_digit($planParam)||(int)$planParam<1))
            return $this->errorResponse(422,'Plano inválido.');
        foreach([$start,$end] as $date){
            if($date!=='' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)
                || !checkdate((int)substr($date,5,2),(int)substr($date,8,2),(int)substr($date,0,4))))
                return $this->errorResponse(422,'Data inválida. Use DD/MM/AAAA.');
        }
        if($start!==''&&$end!==''&&$start>$end)
            return $this->errorResponse(422,'A data inicial não pode superar a final.');
        $query=$db->table('venda_operacoes o')
            ->select('o.id,o.visita_id,o.situacao,o.numero_titulo,o.sigla_plano,o.plano_versao_id,o.data_venda,o.valor_cobrado,c.nome AS cliente_nome')
            ->join('clientes c','c.id=o.cliente_id')
            ->join('plano_versoes pv','pv.id=o.plano_versao_id')
            ->join('visitas v','v.id=o.visita_id','left')
            ->where('o.situacao','VENDA');
        if($a['scope']!==null){
            if($a['manager']){
                $query->groupStart()->where('o.gerente_pessoa_id',$a['scope'])
                    ->orWhere('o.criado_por_usuario_id',(int)$a['user']->id)->groupEnd();
            }else{
                $query->groupStart()->where('o.corretor_pessoa_id',$a['scope'])
                    ->orWhere('o.segundo_corretor_pessoa_id',$a['scope'])
                    ->orWhere('v.criado_por_usuario_id',(int)$a['user']->id)->groupEnd()
                    ->where('o.visita_id IS NOT NULL',null,false);
            }
        }
        if($planParam!=='')$query->where('pv.plano_id',(int)$planParam);
        if($start!=='')$query->where('o.data_venda >=',$start);
        if($end!=='')$query->where('o.data_venda <=',$end);
        $rows=$query->orderBy('o.data_venda','DESC')->orderBy('o.id','DESC')
            ->limit(151)->get()->getResultArray();
        $truncated=count($rows)>150;
        if($truncated)$rows=array_slice($rows,0,150);
        $versions=$db->table('plano_versoes')->select('plano_id,codigo,duracao_meses')
            ->orderBy('id','DESC')->get()->getResultArray();
        $planMap=[];
        foreach($versions as $version){
            $id=(int)$version['plano_id'];
            if(!isset($planMap[$id]))$planMap[$id]=[
                'id'=>$id,'codigo'=>$version['codigo'],
                'duracao_meses'=>(int)$version['duracao_meses'],
            ];
        }
        $plans=array_values($planMap);
        usort($plans,static fn($a,$b)=>$a['duracao_meses']<=>$b['duracao_meses']);
        return $this->response->setJSON([
            'vendas'=>$rows,'planos'=>$plans,'limitado'=>$truncated,
        ])->setHeader('Cache-Control','no-store');
    }

    public function opcoes(): ResponseInterface
    {
        $a=$this->actor();
        if($a instanceof ResponseInterface)return $a;
        $db=db_connect();
        $plans=$db->table('plano_versoes')->select('id,plano_id,codigo,valor,duracao_meses,ativo')
            ->where('ativo',1)->orderBy('duracao_meses','ASC')->get()->getResultArray();
        foreach($plans as &$plan)$plan['nome']=$plan['codigo'].' · '.$plan['duracao_meses'].' meses';
        unset($plan);
        $methods=$db->table('venda_formas_pagamento')
            ->select('id,nome,codigo,credito,ativo')
            ->where('ativo',1)->where('codigo !=','ABATIMENTO_EMP')->orderBy('id')->get()->getResultArray();
        $managers=$db->table('pessoas p')->select('p.id,p.nome')->join('pessoa_papeis pp','pp.pessoa_id=p.id')
            ->where('pp.papel','gerente')->where('p.ativo',1)->groupBy('p.id,p.nome')
            ->orderBy('p.nome')->get()->getResultArray();
        $people=[];
        if($a['admin']){
            foreach($db->table('pessoas p')->select('p.id,p.nome,pp.papel')
                ->join('pessoa_papeis pp','pp.pessoa_id=p.id')
                ->where('p.ativo',1)->whereIn('pp.papel',['corretor','gerente','vendedor'])
                ->orderBy('p.nome')->get()->getResultArray() as $p){
                $id=(int)$p['id'];
                if(!isset($people[$id]))$people[$id]=['id'=>$id,'nome'=>$p['nome'],'papeis'=>[]];
                $people[$id]['papeis'][]=$p['papel'];
            }
        }
        return $this->response->setJSON([
            'planos'=>$plans,'formas'=>$methods,'gerentes'=>$managers,
            'pessoas'=>array_values($people),
            'pode_corrigir_comissao'=>(bool)$a['admin'],
        ])->setHeader('Cache-Control','no-store');
    }

    public function create(): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $data=$this->jsonPayload();
        $visitId=$this->optionalId($data['visita_id']??null);
        if (!$visitId || $visitId===false)
            return $this->errorResponse(422,'Selecione o atendimento com venda fechada.');
        $visit=$this->linkedVisit($visitId,$a);
        if($visit instanceof ResponseInterface)return $visit;
        if ((int)($data['cliente_id']??0)!==(int)$visit['cliente_id'])
            return $this->errorResponse(422,'O cliente deve ser o mesmo do atendimento.');
        // A API web trava corretor/atendentes pelo vínculo com a visita.
        return parent::create();
    }

    public function detalhe(int|string $id): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $op=$this->ownedOperation((int)$id,$a);
        if($op instanceof ResponseInterface)return $op;
        if($a['admin'])return parent::detalhe($id);
        // Corretores não recebem rateios, dados pessoais ou pagamentos de terceiros.
        $db=db_connect();
        $moves=$db->table('venda_recebimentos')->select('tipo,valor')
            ->where('operacao_id',(int)$id)->get()->getResultArray();
        $paid=0;
        foreach($moves as $m)$paid+=($m['tipo']==='ENTRADA'?1:-1)*(VendaMoney::cents((string)$m['valor'],true)??0);
        $base=$op['comissao_ajustada']??$op['comissao_prevista'];
        $gross=$base===null?null:VendaMoney::cents((string)$base,true);
        $own=null;
        if ($gross!==null && !$a['manager'] && (int)$op['corretor_pessoa_id']===(int)$a['scope']) {
            $out=$db->table('comissao_rateios')->select('valor')
                ->where('operacao_id',(int)$id)
                ->where('responsavel_pessoa_id',(int)$a['scope'])->get()->getResultArray();
            $own=$gross;
            foreach($out as $m)$own-=VendaMoney::cents((string)$m['valor'],true)??0;
        }
        // Comissões do gerente vêm apenas dos rateios cujo beneficiário é o login.
        if ($a['manager']) {
            $myRows=$db->table('comissao_rateios')->select('valor')
                ->where('operacao_id',(int)$id)->where('beneficiario_pessoa_id',$a['scope'])
                ->get()->getResultArray();
            if ($myRows) {
                $own=0;
                foreach($myRows as $row)$own+=VendaMoney::cents((string)$row['valor'],true)??0;
            }
        }
        return $this->response->setJSON([
            'operacao'=>[
                'id'=>(int)$op['id'],'visita_id'=>(int)$op['visita_id'],
                'situacao'=>$op['situacao'],'numero_titulo'=>$op['numero_titulo'],
                'sigla_plano'=>$op['sigla_plano'],'valor_cobrado'=>$op['valor_cobrado'],
                'data_venda'=>$op['data_venda'],'observacao_comissao'=>$op['observacao_comissao'],
            ],
            'recebido'=>VendaMoney::decimal($paid),
            'saldo'=>VendaMoney::decimal(max(0,(VendaMoney::cents((string)$op['valor_cobrado'])??0)-$paid)),
            'comissoes'=>['bruta'=>null,'propria'=>$own===null?null:VendaMoney::decimal(max(0,$own)),
                'participantes'=>[],'status'=>$own===null?'AGUARDANDO_APURACAO':'A_RECEBER'],
            'pode_corrigir_comissao'=>false,
        ])->setHeader('Cache-Control','no-store');
    }

    public function receber(int|string $id): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $op=$this->ownedOperation((int)$id,$a);
        if($op instanceof ResponseInterface)return $op;
        if ($op['situacao']!=='VENDA') return $this->errorResponse(409,'Este lançamento não é uma venda fechada.');
        return parent::receber($id);
    }

    public function ajustarComissao(int|string $id): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        if (!$a['admin'])return $this->errorResponse(403,'Ajustes de comissão são exclusivos do administrador.');
        return parent::ajustarComissao($id);
    }


}
