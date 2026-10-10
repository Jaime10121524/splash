<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VendaMoney;
use App\Libraries\PixConferencia;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Localiza Pix efetivos registrados nas vendas e permite vinculá-los à
 * custódia SEM inferir quem tem o dinheiro e SEM liquidar comissões.
 */
final class PixCustodiaController extends CommercialBaseController
{
    private function now(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }

    private function periodo($db,int $id,bool $lock=false): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        $admin=$user->inGroup('admin') && $user->can('closings.manage');
        if(!$admin && (!$user->inGroup('corretor') || !$user->can('finance.own'))){
            return $this->errorResponse(403,'Acesso negado.');
        }
        $period=$db->table('fechamento_periodos f')
            ->select('f.*,p.nome AS responsavel_nome')
            ->join('pessoas p','p.id=f.responsavel_pessoa_id')
            ->where('f.id',$id)->get()->getRowArray();
        if(!$period)return $this->errorResponse(404,'Fechamento não encontrado.');
        if(!$admin){
            $p=$db->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if(!$p || (int)$p['id']!==(int)$period['responsavel_pessoa_id']){
                return $this->errorResponse(403,'Fechamento de outro responsável.');
            }
        }
        if($lock)$db->query('SELECT id FROM fechamento_periodos WHERE id=? FOR UPDATE',[$id])->getRowArray();
        return $period;
    }

    private function saldoRecebimento($db,int $id,string $original): int
    {
        $rows=$db->table('venda_recebimentos')->select('tipo,valor')
            ->where('referencia_entrada_id',$id)->whereIn('tipo',['ESTORNO','DEVOLUCAO'])
            ->get()->getResultArray();
        return PixConferencia::saldo($original,$rows);
    }

    private function origem($db,int $receiptId,array $period): ?array
    {
        $origem=$db->table('venda_recebimentos r')
            ->select('r.*,v.corretor_pessoa_id,v.numero_titulo,v.sigla_plano,v.situacao,p.nome AS corretor_nome,f.codigo AS forma_codigo')
            ->join('venda_operacoes v','v.id=r.operacao_id')
            ->join('pessoas p','p.id=v.corretor_pessoa_id')
            ->join('venda_formas_pagamento f','f.id=r.forma_id')
            ->join('fechamento_periodo_pessoas m','m.pessoa_id=v.corretor_pessoa_id')
            ->where('m.fechamento_id',(int)$period['id'])->where('r.id',$receiptId)
            ->where('r.tipo','ENTRADA')->where('f.codigo','PIX')
            ->where('r.detentor','CORRETOR')->where('v.situacao','VENDA')
            ->where('r.data_movimento <=',$period['fim'])->get()->getRowArray();
        if(!$origem)return null;
        $origem['valor_disponivel']=VendaMoney::decimal(
            $this->saldoRecebimento($db,$receiptId,(string)$origem['valor'])
        );
        return $origem;
    }

    /** Apenas sugestões, não são lançamentos em caixa. */
    public function listar(int|string $id): ResponseInterface
    {
        $db=db_connect();
        $period=$this->periodo($db,(int)$id);
        if($period instanceof ResponseInterface)return $period;
        $members=$db->table('fechamento_periodo_pessoas')
            ->select('pessoa_id')->where('fechamento_id',(int)$id)->get()->getResultArray();
        $ids=array_map(static fn($x)=>(int)$x['pessoa_id'],$members);
        $candidates=[];
        $truncated=false;
        if($ids){
            $rows=$db->table('venda_recebimentos r')
                ->select('r.id,r.operacao_id,r.valor,r.data_movimento,v.numero_titulo,v.sigla_plano,v.corretor_pessoa_id,p.nome AS corretor_nome')
                ->join('venda_operacoes v','v.id=r.operacao_id')
                ->join('pessoas p','p.id=v.corretor_pessoa_id')
                ->join('venda_formas_pagamento f','f.id=r.forma_id')
                ->whereIn('v.corretor_pessoa_id',$ids)->where('v.situacao','VENDA')
                ->where('r.tipo','ENTRADA')->where('f.codigo','PIX')
                ->where('r.detentor','CORRETOR')->where('r.data_movimento <=',$period['fim'])
                ->orderBy('r.data_movimento','DESC')->orderBy('r.id','DESC')->limit(501)
                ->get()->getResultArray();
            $truncated=count($rows)>500;
            $rows=array_slice($rows,0,500);
            $receiptIds=array_map(static fn($row)=>(int)$row['id'],$rows);
            $reversed=[];$linkedIds=[];
            if($receiptIds){
                foreach($db->table('venda_recebimentos')
                    ->select('referencia_entrada_id,valor')
                    ->whereIn('referencia_entrada_id',$receiptIds)
                    ->whereIn('tipo',['ESTORNO','DEVOLUCAO'])->get()->getResultArray() as $refund){
                    $key=(int)$refund['referencia_entrada_id'];
                    $reversed[$key]=($reversed[$key]??0)+VendaMoney::cents((string)$refund['valor'],true);
                }
                foreach($db->table('fechamento_custodia_pix_vinculos')
                    ->select('recebimento_id')->whereIn('recebimento_id',$receiptIds)
                    ->where('situacao','ATIVO')->get()->getResultArray() as $bound){
                    $linkedIds[(int)$bound['recebimento_id']]=true;
                }
            }
            foreach($rows as $row){
                $rid=(int)$row['id'];
                $available=max(0,VendaMoney::cents((string)$row['valor'],true)-($reversed[$rid]??0)); // replaced below
                if($available<=0)continue;
                $linked=isset($linkedIds[$rid]);
                $candidates[]=[
                    'id'=>(int)$row['id'],
                    'operacao_id'=>(int)$row['operacao_id'],
                    'titulo'=>trim((string)$row['numero_titulo'].' '.(string)$row['sigla_plano']),
                    'corretor_nome'=>$row['corretor_nome'],
                    'data'=>$row['data_movimento'],
                    'valor_original'=>$row['valor'],
                    'valor_disponivel'=>VendaMoney::decimal($available),
                    'ja_vinculado'=>$linked,
                ];
            }
        }
        $links=$db->table('fechamento_custodia_pix_vinculos v')
            ->select('v.*,r.operacao_id,r.data_movimento')
            ->join('venda_recebimentos r','r.id=v.recebimento_id')
            ->where('v.fechamento_id',(int)$id)->orderBy('v.id','DESC')
            ->get()->getResultArray();
        foreach($links as &$link){
            $origem=$db->table('venda_recebimentos')->select('valor')
                ->where('id',(int)$link['recebimento_id'])->get()->getRowArray();
            $net=$origem?$this->saldoRecebimento($db,(int)$link['recebimento_id'],(string)$origem['valor']):0;
            $link['valor_atual']=VendaMoney::decimal($net);
            $link['divergente']=$link['situacao']==='ATIVO'
                && $net!==VendaMoney::cents((string)$link['valor'],true);
        }
        unset($link);
        $linkedMovements=array_map(static fn($l)=>(int)$l['movimento_custodia_id'],
            array_filter($links,static fn($l)=>$l['situacao']==='ATIVO'));
        $manual=$db->table('fechamento_custodia_movimentos')
            ->select('id,valor,referencia,data_movimento')
            ->where('fechamento_id',(int)$id)->where('tipo','PIX_RETIDO')
            ->where('situacao','ATIVO')->orderBy('id','DESC')->get()->getResultArray();
        $manual=array_values(array_filter($manual,static fn($m)=>!in_array((int)$m['id'],$linkedMovements,true)));
        return $this->response->setJSON([
            'candidatos'=>$candidates,'vinculos'=>$links,
            'movimentos_manuais_livres'=>$manual,'possivel_truncamento'=>$truncated,
            'aviso'=>'Pix da venda é apenas uma sugestão. Confirme quem tem a posse e se o dinheiro já consta em entradas do clube, saldo anterior ou Pix manual antes de incluí-lo no caixa.',
        ])->setHeader('Cache-Control','no-store');
    }

    public function vincular(int|string $id): ResponseInterface
    {
        $data=$this->jsonPayload();
        $rid=$this->optionalId($data['recebimento_id']??null);
        $modo=(string)($data['modo']??'');
        $chave=(string)($data['chave_requisicao']??'');
        $referencia=$this->cleanText($data['referencia']??null,100,true);
        $obs=$this->cleanText($data['observacoes']??null,400,true);
        if(!$rid || !in_array($modo,['NOVO','EXISTENTE'],true)
            || !preg_match('/^[a-zA-Z0-9_-]{12,55}$/D',$chave)
            || $obs===false || mb_strlen((string)$obs)<10
            || ($modo==='NOVO'&&($referencia===false||mb_strlen((string)$referencia)<3))
            || ($data['confirmado_sem_duplicidade']??false)!==true
            || ($data['confirmado_posse_responsavel']??false)!==true){
            return $this->errorResponse(422,'Confirme a posse do dinheiro, a ausência de duplicidade, a referência e a justificativa.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $period=$this->periodo($db,(int)$id,true);
            if($period instanceof ResponseInterface){$db->transRollback();return $period;}
            if($period['status']!=='CONCLUIDO'){
                $db->transRollback();return $this->errorResponse(409,'Conclua o fechamento antes de conciliar Pix antigos.');
            }
            $already=$db->table('fechamento_custodia_pix_vinculos')
                ->where('fechamento_id',(int)$id)->where('chave_requisicao',$chave)
                ->get()->getRowArray();
            if($already){
                $db->transRollback();return $this->responseOK('Vínculo já registrado, sem duplicar.',200,['duplicado'=>true]);
            }
            // Bloqueia a própria entrada para que dois fechamentos não vinculem o mesmo Pix.
            $db->query('SELECT id FROM venda_recebimentos WHERE id=? FOR UPDATE',[$rid])->getRowArray();
            $origin=$this->origem($db,$rid,$period);
            $valor=$origin?VendaMoney::cents((string)$origin['valor_disponivel'],true):0;
            if(!$origin || !$valor){
                $db->transRollback();return $this->errorResponse(422,'O Pix não está disponível para este grupo ou já foi integralmente devolvido/estornado.');
            }
            if($db->table('fechamento_custodia_pix_vinculos')->where('recebimento_id',$rid)
                ->where('situacao','ATIVO')->countAllResults()){
                $db->transRollback();return $this->errorResponse(409,'Este Pix já está vinculado a uma conciliação.');
            }
            $movId=null;
            if($modo==='EXISTENTE'){
                $mid=$this->optionalId($data['movimento_custodia_id']??null);
                if(!$mid){
                    $db->transRollback();return $this->errorResponse(422,'Escolha o registro manual que corresponde ao Pix.');
                }
                $db->query('SELECT id FROM fechamento_custodia_movimentos WHERE id=? FOR UPDATE',[$mid])->getRowArray();
                $manual=$db->table('fechamento_custodia_movimentos')
                    ->where('id',$mid)->where('fechamento_id',(int)$id)->where('tipo','PIX_RETIDO')
                    ->where('situacao','ATIVO')->get()->getRowArray();
                if(!$manual || !PixConferencia::mesmoValor($valor,(int)VendaMoney::cents((string)$manual['valor'],true))){
                    $db->transRollback();return $this->errorResponse(422,'O lançamento manual precisa estar ativo, neste fechamento, e ter o mesmo valor disponível do Pix.');
                }
                if($db->table('fechamento_custodia_pix_vinculos')
                    ->where('movimento_custodia_id',$mid)->where('situacao','ATIVO')->countAllResults()){
                    $db->transRollback();return $this->errorResponse(409,'Este lançamento de custódia já foi conciliado com outro Pix.');
                }
                $movId=$mid;
            }else{
                // Referência comprovante não pode coincidir com outro Pix já em caixa.
                $duplicate=$db->table('fechamento_custodia_movimentos m')
                    ->join('fechamento_periodos f','f.id=m.fechamento_id')
                    ->where('f.responsavel_pessoa_id',(int)$period['responsavel_pessoa_id'])
                    ->where('m.tipo','PIX_RETIDO')->where('m.situacao','ATIVO')
                    ->where('m.referencia',$referencia)->countAllResults();
                if($duplicate){
                    $db->transRollback();
                    return $this->errorResponse(409,'Essa referência já existe na custódia. Vincule o registro existente, em vez de contar o Pix novamente.');
                }
                $desc=mb_substr('Pix da venda #'.$origin['operacao_id']
                    .' / recebimento #'.$rid.' — '.$obs,0,500);
                $db->table('fechamento_custodia_movimentos')->insert([
                    'fechamento_id'=>(int)$id,'tipo'=>'PIX_RETIDO',
                    'valor'=>VendaMoney::decimal($valor),'data_movimento'=>$origin['data_movimento'],
                    'referencia'=>$referencia,'observacoes'=>$desc,
                    'chave_requisicao'=>'PIXV_'.$chave,'situacao'=>'ATIVO',
                    'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                    'criado_em'=>$this->now(),
                ]);
                $movId=(int)$db->insertID();
            }
            $db->table('fechamento_custodia_pix_vinculos')->insert([
                'fechamento_id'=>(int)$id,'recebimento_id'=>$rid,
                'movimento_custodia_id'=>$movId,'modo'=>$modo,
                'valor'=>VendaMoney::decimal($valor),
                'chave_requisicao'=>$chave,'situacao'=>'ATIVO','observacoes'=>$obs,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK($modo==='EXISTENTE'
                ?'Pix associado ao valor já registrado. Nenhum dinheiro foi somado novamente.'
                :'Pix conciliado e incluído na custódia após confirmação. Nenhuma comissão foi quitada.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'vincular Pix à custódia');}
    }

    public function desvincular(int|string $id,int|string $linkId): ResponseInterface
    {
        $data=$this->jsonPayload();
        $reason=$this->cleanText($data['justificativa']??null,500,true);
        if($reason===false || mb_strlen((string)$reason)<10){
            return $this->errorResponse(422,'Justifique a correção com pelo menos dez caracteres.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $period=$this->periodo($db,(int)$id,true);
            if($period instanceof ResponseInterface){$db->transRollback();return $period;}
            $link=$db->table('fechamento_custodia_pix_vinculos')
                ->where('id',(int)$linkId)->where('fechamento_id',(int)$id)->get()->getRowArray();
            if(!$link){$db->transRollback();return $this->errorResponse(404,'Vínculo não encontrado.');}
            $db->query('SELECT id FROM venda_recebimentos WHERE id=? FOR UPDATE',[(int)$link['recebimento_id']])->getRowArray();
            if($link['situacao']!=='ATIVO'){
                $db->transRollback();return $this->errorResponse(409,'Este vínculo já foi desfeito.');
            }
            if($link['modo']==='NOVO'){
                $movement=$db->table('fechamento_custodia_movimentos')
                    ->where('id',(int)$link['movimento_custodia_id'])
                    ->where('fechamento_id',(int)$id)->get()->getRowArray();
                if(!$movement||$movement['situacao']!=='ATIVO'){
                    $db->transRollback();return $this->errorResponse(409,'Movimento de custódia original não está ativo.');
                }
                // Não remover uma entrada que já custeou pagamentos ou saídas.
                $balance=0;
                foreach($db->table('fechamento_periodo_entradas')->select('valor')
                    ->where('fechamento_id',(int)$id)->get()->getResultArray() as $x){
                    $balance+=VendaMoney::cents((string)$x['valor'],true);
                }
                $internal=$db->table('venda_formas_pagamento')->select('id')->where('codigo','ABATIMENTO_EMP')->get()->getRow('id');
                foreach(['fechamento_periodo_repasses','fechamento_periodo_titulares'] as $table){
                    foreach($db->table($table)->select('valor,forma_id')->where('fechamento_id',(int)$id)
                        ->where('situacao','ATIVO')->get()->getResultArray() as $x){
                        if($table==='fechamento_periodo_titulares' && $internal!==null && (int)$x['forma_id']===(int)$internal)continue;
                        $balance-=VendaMoney::cents((string)$x['valor'],true);
                    }
                }
                foreach($db->table('fechamento_custodia_movimentos')
                    ->where('fechamento_id',(int)$id)->where('situacao','ATIVO')->get()->getResultArray() as $m){
                    $n=VendaMoney::cents((string)$m['valor'],true);
                    $balance+=($m['tipo']==='REPASSE_CLUBE'?-1:1)*$n;
                }
                if($balance<VendaMoney::cents((string)$movement['valor'],true)){
                    $db->transRollback();return $this->errorResponse(409,'Esse Pix já cobre saídas de caixa. Corrija primeiro os repasses/entradas da custódia.');
                }
                $db->table('fechamento_custodia_movimentos')
                    ->where('id',(int)$movement['id'])->update([
                        'situacao'=>'ESTORNADO','motivo_estorno'=>$reason,
                        'estornado_por_usuario_id'=>(int)auth('session')->user()->id,
                        'estornado_em'=>$this->now(),
                    ]);
            }
            $db->table('fechamento_custodia_pix_vinculos')->where('id',(int)$linkId)->update([
                'situacao'=>'ESTORNADO','motivo_estorno'=>$reason,
                'estornado_por_usuario_id'=>(int)auth('session')->user()->id,
                'estornado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK($link['modo']==='EXISTENTE'
                ?'Vínculo desfeito. O lançamento manual permanece no caixa, sem novo crédito.'
                :'Vínculo desfeito e entrada automática de custódia estornada.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'desvincular Pix da custódia');}
    }
}
