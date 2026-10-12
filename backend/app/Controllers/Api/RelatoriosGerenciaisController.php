<?php
declare(strict_types=1);
namespace App\Controllers\Api;
use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/** Consultas administrativas em tempo real; não movimentam ou quitam pagamentos. */
final class RelatoriosGerenciaisController extends CommercialBaseController
{
    public function index():ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $tipo=(string)($this->request->getGet('tipo')??'');
        if(!in_array($tipo,['VENDAS','COMISSOES','ATENDIMENTOS','PENDENCIAS','TITULOS'],true))
            return $this->errorResponse(422,'Relatório inválido.');
        $inicio=(string)($this->request->getGet('inicio')??'');
        $fim=(string)($this->request->getGet('fim')??'');
        if(!$this->validateDate($inicio)||!$this->validateDate($fim)||$inicio>$fim)
            return $this->errorResponse(422,'Intervalo de datas inválido.');
        $person=$this->optionalId($this->request->getGet('pessoa_id'));
        if($person===false)return $this->errorResponse(422,'Pessoa inválida.');
        try{
            $db=db_connect();$lines=[];
            if($tipo==='VENDAS'){
                $q=$db->table('venda_operacoes v')->select('v.id,v.data_venda,v.numero_titulo,v.sigla_plano,v.valor_cobrado,v.comissao_prevista,v.comissao_ajustada,p.nome AS corretor,c.nome AS cliente,fp.status AS status_fechamento')
                    ->join('pessoas p','p.id=v.corretor_pessoa_id')->join('clientes c','c.id=v.cliente_id')
                    ->join('fechamento_periodo_vendas fv','fv.operacao_id=v.id','left')
                    ->join('fechamento_periodos fp','fp.id=fv.fechamento_id','left')
                    ->where('v.situacao','VENDA')->where('v.data_venda >=',$inicio)->where('v.data_venda <=',$fim);
                if($person)$q->where('v.corretor_pessoa_id',$person);
                foreach($q->orderBy('v.data_venda','ASC')->limit(1000)->get()->getResultArray() as $r)
                    $lines[]=[
                        'Data'=>$r['data_venda'],'Título'=>trim($r['numero_titulo'].' '.$r['sigla_plano']),
                        'Cliente'=>$r['cliente'],'Corretor'=>$r['corretor'],
                        'Valor da venda'=>$r['valor_cobrado'],
                        'Comissão bruta'=>$r['comissao_ajustada']??$r['comissao_prevista']??'A apurar',
                        'Fechamento'=>$r['status_fechamento']??'Não vinculado',
                    ];
            }elseif($tipo==='ATENDIMENTOS'){
                $q=$db->table('visitas v')->select('v.id,v.chegada_em,v.inicio_em,v.fim_em,v.status,v.retorno_previsto,c.nome AS cliente,p.nome AS atendente')
                    ->join('clientes c','c.id=v.cliente_id')
                    ->join('pessoas p','p.id=v.atendente_pessoa_id','left')
                    ->where('v.chegada_em >=',$inicio.' 00:00:00')->where('v.chegada_em <=',$fim.' 23:59:59');
                if($person)$q->where('v.atendente_pessoa_id',$person);
                foreach($q->orderBy('v.chegada_em','ASC')->limit(1000)->get()->getResultArray() as $r)
                    $lines[]=['Chegada'=>$r['chegada_em'],'Cliente'=>$r['cliente'],
                        'Atendente'=>$r['atendente']?:'Não atribuído',
                        'Início'=>$r['inicio_em']??'','Fim'=>$r['fim_em']??'',
                        'Situação'=>$r['status'],'Retorno'=>$r['retorno_previsto']??''];
            }elseif($tipo==='PENDENCIAS'){
                $q=$db->table('venda_operacoes v')->select('v.id,v.data_negociacao,v.retorno_previsto,v.numero_titulo,v.sigla_plano,v.valor_cobrado,c.nome AS cliente,p.nome AS corretor')
                    ->join('clientes c','c.id=v.cliente_id')->join('pessoas p','p.id=v.corretor_pessoa_id')
                    ->where('v.situacao','PENDENCIA')->where('v.data_negociacao >=',$inicio)
                    ->where('v.data_negociacao <=',$fim);
                if($person)$q->where('v.corretor_pessoa_id',$person);
                foreach($q->orderBy('v.retorno_previsto','ASC')->limit(1000)->get()->getResultArray() as $r)
                    $lines[]=['Negociação'=>$r['data_negociacao'],'Cliente'=>$r['cliente'],'Corretor'=>$r['corretor'],
                        'Título'=>trim(($r['numero_titulo']??'').' '.$r['sigla_plano']),
                        'Valor previsto'=>$r['valor_cobrado'],'Retorno'=>$r['retorno_previsto']??''];
            }elseif($tipo==='TITULOS'){
                $q=$db->table('venda_operacoes v')->select('v.id,v.numero_titulo,v.sigla_plano,v.data_vencimento,c.nome AS cliente,p.nome AS corretor')
                    ->join('clientes c','c.id=v.cliente_id')->join('pessoas p','p.id=v.corretor_pessoa_id')
                    ->join('titulo_vinculos link','link.operacao_origem_id=v.id','left')
                    ->where('v.situacao','VENDA')->where('link.id IS NULL',null,false)
                    ->where('v.data_vencimento >=',$inicio)->where('v.data_vencimento <=',$fim);
                if($person)$q->where('v.corretor_pessoa_id',$person);
                foreach($q->orderBy('v.data_vencimento','ASC')->limit(1000)->get()->getResultArray() as $r)
                    $lines[]=['Título'=>trim($r['numero_titulo'].' '.$r['sigla_plano']),
                        'Cliente'=>$r['cliente'],'Corretor'=>$r['corretor'],'Vencimento'=>$r['data_vencimento']];
            }else{
                $q=$db->table('venda_operacoes v')->select('v.id,v.corretor_pessoa_id,v.comissao_prevista,v.comissao_ajustada,v.valor_cobrado')
                    ->where('v.situacao','VENDA')->where('v.data_venda >=',$inicio)->where('v.data_venda <=',$fim);
                $sales=$q->limit(1000)->get()->getResultArray();
                $ids=array_map(static fn($r)=>(int)$r['id'],$sales);
                if($ids){
                    $rateios=$db->table('comissao_rateios')->whereIn('operacao_id',$ids)->get()->getResultArray();
                    $payments=$db->table('comissao_repasses')->select('rateio_id,tipo,valor')
                        ->whereIn('rateio_id',array_map(static fn($r)=>(int)$r['id'],$rateios)?:[0])->get()->getResultArray();
                    $owners=$db->table('comissao_titular_movimentos')
                        ->select('operacao_id,tipo,valor')->whereIn('operacao_id',$ids)->get()->getResultArray();
                    $all=$db->table('pessoas')->select('id,nome')->get()->getResultArray();
                    $names=array_column($all,'nome','id');
                    $bySale=[];$byRate=[];$paidOwner=[];
                    foreach($rateios as $r)$bySale[(int)$r['operacao_id']][]=$r;
                    foreach($payments as $m){
                        $id=(int)$m['rateio_id'];
                        $byRate[$id]=($byRate[$id]??0)+($m['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$m['valor'],true);
                    }
                    foreach($owners as $m){
                        $id=(int)$m['operacao_id'];
                        $paidOwner[$id]=($paidOwner[$id]??0)+($m['tipo']==='PAGAMENTO'?1:-1)*VendaMoney::cents((string)$m['valor'],true);
                    }
                    $people=[];
                    $add=static function(int $id,int $due,int $paid)use(&$people):void{
                        $people[$id]??=['direito'=>0,'pago'=>0];
                        $people[$id]['direito']+=$due;$people[$id]['pago']+=$paid;
                    };
                    foreach($sales as $v){
                        $id=(int)$v['id'];$owner=(int)$v['corretor_pessoa_id'];
                        $base=$v['comissao_ajustada']??$v['comissao_prevista'];
                        if($base===null)continue;
                        $gross=VendaMoney::cents((string)$base,true);$out=0;
                        foreach($bySale[$id]??[] as $r){
                            $due=VendaMoney::cents((string)$r['valor'],true);
                            if((int)$r['responsavel_pessoa_id']===$owner)$out+=$due;
                            $add((int)$r['beneficiario_pessoa_id'],$due,$byRate[(int)$r['id']]??0);
                        }
                        $add($owner,$gross-$out,$paidOwner[$id]??0);
                    }
                    foreach($people as $id=>$p){
                        if($person && $person!==$id)continue;
                        $lines[]=['Pessoa'=>$names[$id]??('#'.$id),
                            'Comissões'=>VendaMoney::decimal($p['direito']),
                            'Liquidado'=>VendaMoney::decimal($p['pago']),
                            'A receber'=>VendaMoney::decimal(max(0,$p['direito']-$p['pago']))];
                    }
                }
            }
            return $this->response->setJSON([
                'tipo'=>$tipo,'inicio'=>$inicio,'fim'=>$fim,'linhas'=>$lines,
                'limite'=>1000,'truncado'=>count($lines)>=1000,
            ])->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){return $this->unexpected($e,'relatórios gerenciais');}
    }
}
