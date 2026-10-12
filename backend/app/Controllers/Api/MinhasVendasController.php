<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\MinhasVendasConta;
use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Só leitura: vendas onde a pessoa autenticada participa.
 * Consulta sem JOIN de clientes, sem aceitar pessoa_id de frontend.
 */
final class MinhasVendasController extends CommercialBaseController
{
    private function pessoa(): int|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Faça login novamente.');
        if(!$user->can('sales.own') || !(
            $user->inGroup('corretor') || $user->inGroup('vendedor') || $user->inGroup('gerente')
        )){
            return $this->errorResponse(403,'Sua conta não pode consultar vendas individuais.');
        }
        $row=db_connect()->table('pessoas')->select('id')
            ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
        if(!$row)return $this->errorResponse(403,'Não existe pessoa ativa vinculada ao seu usuário.');
        return (int)$row['id'];
    }

    private function somenteMinhas($builder,int $pessoaId)
    {
        // O ID sempre vem do Shield e da tabela pessoas, não de GET ou JSON.
        $builder->groupStart()
            ->where('o.corretor_pessoa_id',$pessoaId)
            ->orWhere('o.segundo_corretor_pessoa_id',$pessoaId)
            ->orWhere('o.atendente_pessoa_id',$pessoaId)
            ->orWhere('o.atendente_adicional_pessoa_id',$pessoaId)
            ->orWhere('o.gerente_pessoa_id',$pessoaId)
            ->orWhere('EXISTS (SELECT 1 FROM comissao_rateios r WHERE r.operacao_id=o.id AND r.beneficiario_pessoa_id='.(int)$pessoaId.')',null,false)
            ->groupEnd();
        return $builder;
    }

    private function busca($db,int $pessoaId)
    {
        $sql=$db->table('venda_operacoes o')
            ->select('o.id,o.situacao,o.numero_titulo,o.sigla_plano,o.data_venda,o.data_vencimento,o.valor_cobrado,o.comissao_prevista,o.comissao_ajustada,o.corretor_pessoa_id,o.segundo_corretor_pessoa_id,o.atendente_pessoa_id,o.atendente_adicional_pessoa_id,o.gerente_pessoa_id')
            ->where('o.situacao','VENDA');
        return $this->somenteMinhas($sql,$pessoaId);
    }

    private function reconciliar($db,array $sales,int $pessoaId): array
    {
        if(!$sales)return [];
        $ids=array_map(static fn($x)=>(int)$x['id'],$sales);
        $receiptRows=$db->table('venda_recebimentos')
            ->select('operacao_id,tipo,valor')->whereIn('operacao_id',$ids)->get()->getResultArray();
        $received=[];
        foreach($receiptRows as $r){
            $id=(int)$r['operacao_id'];
            $received[$id]=($received[$id]??0)+($r['tipo']==='ENTRADA'?1:-1)
                *VendaMoney::cents((string)$r['valor'],true);
        }

        // Rateios de TODOS os destinatários são usados apenas para subtrair
        // obrigações do titular. Jamais são devolvidos à conta individual.
        $rateios=$db->table('comissao_rateios')
            ->select('id,operacao_id,responsavel_pessoa_id,beneficiario_pessoa_id,papel,valor')
            ->whereIn('operacao_id',$ids)->orderBy('id')->get()->getResultArray();
        $bySale=[];$myRateIds=[];
        foreach($rateios as $r){
            $bySale[(int)$r['operacao_id']][]=$r;
            if((int)$r['beneficiario_pessoa_id']===$pessoaId)$myRateIds[]=(int)$r['id'];
        }
        $auto=[];
        foreach($db->table('comissao_auto_apuracoes')
            ->select('operacao_id,status')->whereIn('operacao_id',$ids)->get()->getResultArray() as $a){
            $auto[(int)$a['operacao_id']]=$a['status'];
        }

        $own=[];
        // Só movimentos cujo titular é de fato a própria pessoa.
        foreach($db->table('comissao_titular_movimentos')
            ->select('id,operacao_id,tipo,valor,forma_id,data_pagamento')
            ->where('corretor_pessoa_id',$pessoaId)->whereIn('operacao_id',$ids)
            ->orderBy('id','ASC')->get()->getResultArray() as $m){
            $own[(int)$m['operacao_id']][]=$m;
        }
        $parts=[];
        if($myRateIds){
            foreach($db->table('comissao_repasses')
                ->select('id,rateio_id,tipo,valor,forma_id,data_pagamento')
                ->whereIn('rateio_id',$myRateIds)->orderBy('id','ASC')
                ->get()->getResultArray() as $m){
                $parts[(int)$m['rateio_id']][]=$m;
            }
        }
        $abat=$db->table('venda_formas_pagamento')->select('id')
            ->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
        $abatId=(int)($abat['id']??0);
        $periods=[];
        foreach($db->table('fechamento_periodo_vendas fv')
            ->select('fv.operacao_id,fp.id,fp.status')
            ->join('fechamento_periodos fp','fp.id=fv.fechamento_id')
            ->whereIn('fv.operacao_id',$ids)->get()->getResultArray() as $period){
            $periods[(int)$period['operacao_id']]=$period;
        }

        $result=[];
        foreach($sales as $row){
            $id=(int)$row['id'];
            $paid=($received[$id]??0)===VendaMoney::cents((string)$row['valor_cobrado'],true);
            $period=$periods[$id]??null;
            $working=$period!==null && $period['status']!=='CONCLUIDO';
            $mine=MinhasVendasConta::minhaParticipacao(
                $row,$pessoaId,$bySale[$id]??[],$own[$id]??[],$parts,
                $auto[$id]??null,$paid,$abatId,$working
            );
            $done=($period!==null && $period['status']==='CONCLUIDO')?(int)$period['id']:null;
            $result[]=MinhasVendasConta::publico($row,$mine,$paid,$done);
        }
        return $result;
    }

    public function index(): ResponseInterface
    {
        $pessoa=$this->pessoa();
        if($pessoa instanceof ResponseInterface)return $pessoa;
        $q=trim((string)($this->request->getGet('q')??''));
        if(mb_strlen($q)>45)return $this->errorResponse(422,'Pesquisa muito longa.');
        $start=(string)($this->request->getGet('inicio')??'');
        $end=(string)($this->request->getGet('fim')??'');
        if(($start!==''||$end!=='') && (!$this->validateDate($start)
            || !$this->validateDate($end) || $start>$end)){
            return $this->errorResponse(422,'Informe as duas datas válidas, inicial e final.');
        }
        $page=filter_var($this->request->getGet('pagina')??1,
            FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>200]]);
        if($page===false)return $this->errorResponse(422,'Página inválida.');
        $db=db_connect();
        $query=$this->busca($db,$pessoa);
        if($start!=='')$query->where('o.data_venda >=',$start)->where('o.data_venda <=',$end);
        if($q!==''){
            $query->groupStart()->like('o.numero_titulo',$q)->orLike('o.sigla_plano',$q)->groupEnd();
        }
        $rows=$query->orderBy('o.data_venda','DESC')->orderBy('o.id','DESC')
            ->limit(26,($page-1)*25)->get()->getResultArray();
        $next=count($rows)>25;
        $rows=array_slice($rows,0,25);
        try {
            $public=$this->reconciliar($db,$rows,$pessoa);
            // Resumo referente somente aos registros da página.
            $totals=['vendas'=>count($public),'a_apurar'=>0,'a_receber'=>'0.00',
                'liquidado'=>'0.00'];
            $open=$settled=0;
            foreach($public as $item){
                $c=$item['comissao'];
                if($c['direito']===null)$totals['a_apurar']++;
                if($c['pendente']!==null)$open+=VendaMoney::cents((string)$c['pendente'],true);
                if($c['liquidado']!==null)$settled+=VendaMoney::cents((string)$c['liquidado'],true);
            }
            $totals['a_receber']=VendaMoney::decimal($open);
            $totals['liquidado']=VendaMoney::decimal($settled);
            return $this->response->setJSON([
                'vendas'=>$public,'pagina'=>$page,'tem_mais'=>$next,
                'resumo_pagina'=>$totals,
                'aviso'=>'Valores de comissão exclusivos da sua conta; apenas recebimentos, pagamentos e abatimentos confirmados alteram o saldo. Valores de terceiros e dados do associado não são exibidos.',
            ])->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){return $this->unexpected($e,'consultar minhas vendas');}
    }

    public function detalhe(int|string $id): ResponseInterface
    {
        $pessoa=$this->pessoa();
        if($pessoa instanceof ResponseInterface)return $pessoa;
        $db=db_connect();
        // O mesmo filtro de posse da listagem protege o acesso direto por ID.
        $row=$this->busca($db,$pessoa)->where('o.id',(int)$id)->get()->getRowArray();
        if(!$row)return $this->errorResponse(404,'Venda não encontrada entre suas participações.');
        try {
            $items=$this->reconciliar($db,[$row],$pessoa);
            return $this->response->setJSON(['venda'=>$items[0]])
                ->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){return $this->unexpected($e,'extrato próprio da venda');}
    }
}
