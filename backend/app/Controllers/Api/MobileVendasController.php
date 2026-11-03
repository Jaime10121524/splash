<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\ComissaoAutomatica;
use App\Libraries\RateioAutomatico;
use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

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
        if (!$u->inGroup('admin','operador','gerente','corretor'))
            return $this->errorResponse(403,'Perfil sem permissão para registrar vendas.');
        $admin=$u->inGroup('admin');
        $scope=null;
        if (!$admin && $u->inGroup('corretor') && !$u->inGroup('operador','gerente')) {
            $p=db_connect()->table('pessoas')->select('id')->where('user_id',(int)$u->id)
                ->where('ativo',1)->get()->getRowArray();
            if (!$p) return $this->errorResponse(403,'Conta sem corretor vinculado.');
            $scope=(int)$p['id'];
        }
        return ['user'=>$u,'admin'=>$admin,'scope'=>$scope];
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
        if ($a['scope']!==null && !in_array($a['scope'],[(int)$visit['corretor_pessoa_id'],(int)($visit['segundo_corretor_pessoa_id']??0)],true)
            && (int)$visit['criado_por_usuario_id']!==(int)$a['user']->id)
            return $this->errorResponse(404,'Visita não encontrada.');
        return $visit;
    }

    private function ownedOperation(int $id,array $a): array|ResponseInterface
    {
        $op=db_connect()->table('venda_operacoes')->where('id',$id)->get()->getRowArray();
        if (!$op) return $this->errorResponse(404,'Venda não encontrada.');
        if ($a['admin'] || $a['scope']===null) return $op;
        $visitId=(int)($op['visita_id']??0);
        if ($visitId<1) return $this->errorResponse(404,'Venda não encontrada.');
        $visit=$this->linkedVisit($visitId,$a);
        return $visit instanceof ResponseInterface?$visit:$op;
    }

    public function opcoes(): ResponseInterface
    {
        $a=$this->actor();
        if($a instanceof ResponseInterface)return $a;
        $db=db_connect();
        $plans=$db->table('plano_versoes')->select('id,plano_id,nome,codigo,valor,duracao_meses,ativo')
            ->where('ativo',1)->orderBy('duracao_meses','ASC')->get()->getResultArray();
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
        if ($gross!==null && (int)$op['corretor_pessoa_id']===(int)$a['scope']) {
            $out=$db->table('comissao_rateios')->select('valor')
                ->where('operacao_id',(int)$id)
                ->where('responsavel_pessoa_id',(int)$a['scope'])->get()->getResultArray();
            $own=$gross;
            foreach($out as $m)$own-=VendaMoney::cents((string)$m['valor'],true)??0;
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

    /** Prévia calculada pelas MESMAS regras automáticas e de rateio do web.
     * Não grava venda nem realiza pagamento de comissão.
     */
    public function previa(): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $in=$this->jsonPayload();
        $visitId=$this->optionalId($in['visita_id']??null);
        $versionId=$this->optionalId($in['plano_versao_id']??null);
        if(!$visitId||!$versionId)return $this->errorResponse(422,'Informe visita e plano.');
        $visit=$this->linkedVisit($visitId,$a);
        if($visit instanceof ResponseInterface)return $visit;
        $db=db_connect();
        try {
            $plan=$db->table('plano_versoes')->where('id',$versionId)->where('ativo',1)->get()->getRowArray();
            if(!$plan)return $this->errorResponse(422,'Plano indisponível.');
            $table=VendaMoney::cents((string)$plan['valor']);
            $discount=VendaMoney::cents($in['desconto_corretor']??'0',true);
            if($table===null||$discount===null||$discount>=$table)return $this->errorResponse(422,'Desconto inválido.');
            $due=$table-$discount;
            $rows=[];$sum=0;
            if(!is_array($in['pagamentos']??null)||count($in['pagamentos'])>20)
                return $this->errorResponse(422,'Informe até 20 pagamentos.');
            foreach($in['pagamentos'] as $p){
                if(!is_array($p))return $this->errorResponse(422,'Pagamento inválido.');
                $id=$this->optionalId($p['forma_id']??null);
                $amount=VendaMoney::cents($p['valor']??null);
                $method=$id?$db->table('venda_formas_pagamento')->where('id',$id)
                    ->where('ativo',1)->where('codigo !=','ABATIMENTO_EMP')->get()->getRowArray():null;
                if(!$method||$amount===null)return $this->errorResponse(422,'Forma ou valor de pagamento inválido.');
                $sum+=$amount;
                $rows[]=['tipo'=>'ENTRADA','valor'=>VendaMoney::decimal($amount),'credito'=>(bool)$method['credito']];
            }
            if($sum>$due)return $this->errorResponse(422,'Pagamentos excedem o valor da venda.');
            $rules=ComissaoAutomatica::configs($db);
            $calc=ComissaoAutomatica::calculate($rules,$rows,$due,$table,$discount,false);
            $result=['valor_cobrado'=>VendaMoney::decimal($due),
                'pagamentos'=>VendaMoney::decimal($sum),
                'saldo'=>VendaMoney::decimal($due-$sum),
                'comissao_bruta'=>$a['admin']?$calc['valor']:null,
                'aviso'=>$calc['aviso'],'participantes'=>[],'comissao_propria'=>null,
                'regra'=>$a['admin']?($calc['rule']['nome']??null):null];
            if($calc['valor']!==null && $calc['rule']!==null) {
                $policy=$db->table('comissao_politicas')->where('id',1)->get()->getRowArray();
                $date=(string)($in['data_venda']??'');
                if(!$policy||!$this->validateDate($date,false))
                    return $this->errorResponse(422,'Informe uma data de venda válida.');
                $manager=$this->optionalId($in['gerente_pessoa_id']??null);
                if($manager===false)return $this->errorResponse(422,'Gerente inválido.');
                $op=[
                    'comissao_prevista'=>$calc['valor'],'valor_tabela'=>VendaMoney::decimal($table),
                    'corretor_pessoa_id'=>$visit['corretor_pessoa_id'],
                    'segundo_corretor_pessoa_id'=>$visit['segundo_corretor_pessoa_id'],
                    'atendente_pessoa_id'=>$visit['atendente_pessoa_id'],
                    'atendente_adicional_pessoa_id'=>$visit['atendente_adicional_pessoa_id'],
                    'gerente_pessoa_id'=>$manager,'data_venda'=>$date,
                    'duracao_meses'=>(int)$plan['duracao_meses'],
                    'regra_snapshot'=>json_encode($calc['rule'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                    '_regras_especiais'=>$db->table('comissao_excecoes_plano')
                        ->where('plano_versao_id',$versionId)->get()->getResultArray(),
                ];
                $holiday=(bool)$db->table('comissao_feriados')->where('data',$date)->countAllResults();
                $client=$db->table('clientes c')->select('o.nome AS origem_nome')
                    ->join('lead_origens o','o.id=c.origem_id','left')
                    ->where('c.id',$visit['cliente_id'])->get()->getRowArray();
                $renewal=!!$visit['segundo_corretor_pessoa_id']
                    && mb_stripos((string)($client['origem_nome']??''),'renova')!==false;
                $proposal=RateioAutomatico::propose($op,$policy,$holiday,$renewal);
                $out=0;
                foreach($proposal['rateios'] as $item){
                    if((int)$item['origem']===(int)$visit['corretor_pessoa_id'])$out+=$item['valor'];
                }
                $own=VendaMoney::cents($calc['valor'])-$out;
                if($a['admin']){
                    $ids=array_unique(array_column($proposal['rateios'],'destino'));
                    $names=[];
                    if($ids)foreach($db->table('pessoas')->select('id,nome')->whereIn('id',$ids)->get()->getResultArray() as $p)
                        $names[(int)$p['id']]=$p['nome'];
                    foreach($proposal['rateios'] as $item)$result['participantes'][]=[
                        'pessoa_id'=>(int)$item['destino'],'nome'=>$names[(int)$item['destino']]??'Participante',
                        'papel'=>$item['papel'],'valor'=>VendaMoney::decimal($item['valor']),
                    ];
                    $result['comissao_propria']=VendaMoney::decimal(max(0,$own));
                }elseif($a['scope']!==null
                    && (int)$visit['corretor_pessoa_id']===(int)$a['scope']){
                    $result['comissao_propria']=VendaMoney::decimal(max(0,$own));
                }
                $result['aviso']=implode(' ',array_merge([$calc['aviso']],$proposal['avisos']));
            }
            return $this->response->setJSON($result)->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){
            log_message('error','SPLASH prévia mobile de venda: {error}',['error'=>$e->getMessage()]);
            return $this->errorResponse(500,'Não foi possível calcular o comissionamento.');
        }
    }
}
