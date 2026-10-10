<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\ConciliacaoCaixa;
use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/** Controle de posse física do dinheiro do clube no fechamento. */
final class ConciliacaoCustodiaController extends CommercialBaseController
{
    private function now(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }

    /** O administrador supervisiona; o corretor comum vê apenas seu fechamento próprio. */
    private function periodo($db,int $id,bool $lock=false): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        $admin=$user->inGroup('admin') && $user->can('closings.manage');
        if(!$admin && (!$user->inGroup('corretor') || !$user->can('finance.own'))){
            return $this->errorResponse(403,'Acesso não autorizado.');
        }
        $period=$db->table('fechamento_periodos f')
            ->select('f.*,p.nome AS responsavel_nome')
            ->join('pessoas p','p.id=f.responsavel_pessoa_id')
            ->where('f.id',$id)->get()->getRowArray();
        if(!$period)return $this->errorResponse(404,'Fechamento não encontrado.');
        if(!$admin){
            $person=$db->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if(!$person || (int)$person['id']!==(int)$period['responsavel_pessoa_id']){
                return $this->errorResponse(403,'Este fechamento pertence a outro responsável.');
            }
        }
        if($lock)$db->query('SELECT id FROM fechamento_periodos WHERE id=? FOR UPDATE',[$id])->getRowArray();
        return $period;
    }

    /** Apenas movimentos reais; abatimento de empréstimo não tira dinheiro do caixa. */
    private function balanco($db,array $period): array
    {
        $id=(int)$period['id'];
        $recebido=0;$pago=0;
        foreach($db->table('fechamento_periodo_entradas')->select('valor')
            ->where('fechamento_id',$id)->get()->getResultArray() as $r){
            $recebido+=VendaMoney::cents((string)$r['valor'],true);
        }
        $internal=$db->table('venda_formas_pagamento')->select('id')
            ->where('codigo','ABATIMENTO_EMP')->get()->getRow('id');
        foreach(['fechamento_periodo_repasses','fechamento_periodo_titulares'] as $table){
            $query=$db->table($table)->select('valor,forma_id')
                ->where('fechamento_id',$id)->where('situacao','ATIVO');
            foreach($query->get()->getResultArray() as $r){
                if($table==='fechamento_periodo_titulares' && $internal!==null
                    && (int)$r['forma_id']===(int)$internal)continue;
                $pago+=VendaMoney::cents((string)$r['valor'],true);
            }
        }
        $movimentos=$db->table('fechamento_custodia_movimentos')
            ->where('fechamento_id',$id)->orderBy('id','DESC')->get()->getResultArray();
        $saldos=ConciliacaoCaixa::calcular($recebido,$pago,$movimentos);
        return [
            'fechamento_id'=>$id,
            'responsavel_nome'=>$period['responsavel_nome'],
            'inicio'=>$period['inicio'],'fim'=>$period['fim'],
            'status_fechamento'=>$period['status'],
            'saldos'=>$saldos,
            'movimentos'=>$movimentos,
            'aviso'=>'É conferência de dinheiro em custódia, não comissão pessoal. Registre valores anteriores ou Pix retidos somente com origem comprovada. Os pagamentos e os recebimentos do clube já lançados não devem ser cadastrados novamente aqui.',
        ];
    }

    public function index(int|string $id): ResponseInterface
    {
        $db=db_connect();
        $period=$this->periodo($db,(int)$id);
        if($period instanceof ResponseInterface)return $period;
        return $this->response->setJSON(['conciliacao'=>$this->balanco($db,$period)])
            ->setHeader('Cache-Control','no-store');
    }

    public function registrar(int|string $id): ResponseInterface
    {
        $data=$this->jsonPayload();
        $tipo=(string)($data['tipo']??'');
        $valor=VendaMoney::cents($data['valor']??null);
        $dia=(string)($data['data_movimento']??'');
        $referencia=$this->cleanText($data['referencia']??null,100,true);
        $obs=$this->cleanText($data['observacoes']??null,500,true);
        $chave=(string)($data['chave_requisicao']??'');
        if(!in_array($tipo,ConciliacaoCaixa::TIPOS,true) || !$valor
            || !$this->validateDate($dia,false) || $referencia===false
            || mb_strlen((string)$referencia)<3 || $obs===false || mb_strlen((string)$obs)<10
            || !preg_match('/^[a-zA-Z0-9_-]{12,64}$/D',$chave)){
            return $this->errorResponse(422,'Informe tipo, valor, data, referência, justificativa (10 caracteres) e chave válida.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $period=$this->periodo($db,(int)$id,true);
            if($period instanceof ResponseInterface){$db->transRollback();return $period;}
            $same=$db->table('fechamento_custodia_movimentos')
                ->where('fechamento_id',(int)$id)->where('chave_requisicao',$chave)
                ->get()->getRowArray();
            if($same){
                $db->transRollback();
                return $this->responseOK('Movimento já registrado. Nenhum valor foi duplicado.',200,['duplicado'=>true]);
            }
            $old=$this->balanco($db,$period);
            if($tipo==='PIX_RETIDO'){
                $repetido=$db->table('fechamento_custodia_movimentos c')
                    ->join('fechamento_periodos f','f.id=c.fechamento_id')
                    ->where('f.responsavel_pessoa_id',(int)$period['responsavel_pessoa_id'])
                    ->where('c.tipo','PIX_RETIDO')->where('c.situacao','ATIVO')
                    ->where('c.referencia',$referencia)->countAllResults();
                if($repetido){
                    $db->transRollback();
                    return $this->errorResponse(409,'Referência de Pix já utilizada neste grupo. Confira o movimento anterior.');
                }
            }
            if($tipo==='SALDO_ANTERIOR'){
                foreach($old['movimentos'] as $movement){
                    if($movement['tipo']==='SALDO_ANTERIOR' && $movement['situacao']==='ATIVO'){
                        $db->transRollback();
                        return $this->errorResponse(409,'Já existe saldo anterior ativo. Estorne-o para corrigir.');
                    }
                }
            }
            if($tipo==='REPASSE_CLUBE'){
                $disponivel=VendaMoney::cents((string)$old['saldos']['saldo_conciliado'],true);
                if($disponivel===null || $valor>$disponivel){
                    $db->transRollback();
                    return $this->errorResponse(422,'O repasse ao clube excede o saldo conciliado. Confira as entradas e os valores anteriores.');
                }
            }
            $db->table('fechamento_custodia_movimentos')->insert([
                'fechamento_id'=>(int)$id,'tipo'=>$tipo,'valor'=>VendaMoney::decimal($valor),
                'data_movimento'=>$dia,'referencia'=>$referencia,'observacoes'=>$obs,
                'chave_requisicao'=>$chave,'situacao'=>'ATIVO',
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Movimento de custódia registrado. Nenhuma comissão foi baixada.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'registrar custódia');}
    }

    public function estornar(int|string $id,int|string $movimentoId): ResponseInterface
    {
        $data=$this->jsonPayload();
        $motivo=$this->cleanText($data['justificativa']??null,500,true);
        if($motivo===false || mb_strlen((string)$motivo)<10){
            return $this->errorResponse(422,'Informe pelo menos dez caracteres para justificar o estorno.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $period=$this->periodo($db,(int)$id,true);
            if($period instanceof ResponseInterface){$db->transRollback();return $period;}
            $entry=$db->table('fechamento_custodia_movimentos')
                ->where('id',(int)$movimentoId)->where('fechamento_id',(int)$id)
                ->get()->getRowArray();
            if(!$entry){$db->transRollback();return $this->errorResponse(404,'Lançamento não encontrado.');}
            if($entry['situacao']!=='ATIVO'){
                $db->transRollback();
                return $this->errorResponse(409,'Este lançamento já foi estornado.');
            }
            if($entry['tipo']!=='REPASSE_CLUBE'){
                $old=$this->balanco($db,$period);
                $disponivel=VendaMoney::cents((string)$old['saldos']['saldo_conciliado'],true);
                $valor=VendaMoney::cents((string)$entry['valor'],true);
                if($disponivel===null || $disponivel<$valor){
                    $db->transRollback();
                    return $this->errorResponse(409,'Estornar esta entrada deixaria a custódia negativa. Estorne primeiro a saída correspondente.');
                }
            }
            $db->table('fechamento_custodia_movimentos')->where('id',(int)$movimentoId)->update([
                'situacao'=>'ESTORNADO','motivo_estorno'=>$motivo,
                'estornado_por_usuario_id'=>(int)auth('session')->user()->id,
                'estornado_em'=>$this->now(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Estorno registrado no histórico. Nenhuma comissão foi alterada.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'estornar custódia');}
    }
}
