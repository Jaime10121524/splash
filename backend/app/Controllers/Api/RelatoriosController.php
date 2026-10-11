<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\RelatorioAcertoSemanal;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Acerto semanal: administrador vê tudo, demais usuários SOMENTE a sua
 * própria comissão em fechamentos já CONCLUÍDOS pelo responsável.
 * Não há endpoint que aceite pessoa_id vindo do navegador.
 */
final class RelatoriosController extends CommercialBaseController
{
    private function actor(): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user||$user->isBanned())return $this->errorResponse(401,'Faça login novamente.');
        $admin=$user->inGroup('admin')&&$user->can('reports.own');
        if(!$admin && !$user->can('reports.own')) {
            return $this->errorResponse(403,'Você não tem acesso a relatórios.');
        }
        $person=null;
        if(!$admin) {
            $person=db_connect()->table('pessoas')->select('id,nome')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if(!$person)return $this->errorResponse(403,'Sua conta não tem pessoa ativa vinculada.');
        }
        return ['admin'=>$admin,'pessoa_id'=>$person?(int)$person['id']:null];
    }

    /**
     * Apenas fecha­ mentos concluidos que contêm um direito próprio.
     * Este filtro no banco evita divulgar a existência dos demais fechamentos.
     */
    private function completedIdsForPerson($db,int $personId): array
    {
        $owner=$db->table('fechamento_periodo_vendas f')
            ->distinct()->select('f.fechamento_id')
            ->join('venda_operacoes o','o.id=f.operacao_id')
            ->where('o.corretor_pessoa_id',$personId)->get()->getResultArray();
        $part=$db->table('fechamento_periodo_vendas f')
            ->distinct()->select('f.fechamento_id')
            ->join('comissao_rateios r','r.operacao_id=f.operacao_id')
            ->where('r.beneficiario_pessoa_id',$personId)->get()->getResultArray();
        return array_values(array_unique(array_map('intval',array_merge(
            array_column($owner,'fechamento_id'),array_column($part,'fechamento_id')
        ))));
    }

    private function authorizedPeriod($db,int $id,array $actor): array|ResponseInterface
    {
        $period=$db->table('fechamento_periodos f')
            ->select('f.id,f.inicio,f.fim,f.status,f.concluido_em,f.responsavel_pessoa_id,f.resumo_concluido,p.nome AS responsavel_nome')
            ->join('pessoas p','p.id=f.responsavel_pessoa_id')
            ->where('f.id',$id)->where('f.status','CONCLUIDO')->get()->getRowArray();
        if(!$period)return $this->errorResponse(404,'Relatório não disponível. O fechamento deve estar concluído.');
        if(!$actor['admin'] && !in_array($id,$this->completedIdsForPerson($db,$actor['pessoa_id']),true)) {
            return $this->errorResponse(404,'Relatório não disponível para sua conta.');
        }
        return $period;
    }

    public function periodos(): ResponseInterface
    {
        $actor=$this->actor();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $q=$db->table('fechamento_periodos f')
            ->select('f.id,f.inicio,f.fim,f.concluido_em,f.responsavel_pessoa_id')
            ->where('f.status','CONCLUIDO');
        if(!$actor['admin']){
            $ids=$this->completedIdsForPerson($db,$actor['pessoa_id']);
            if(!$ids)return $this->response->setJSON(['fechamentos'=>[],'administrador'=>false])
                ->setHeader('Cache-Control','no-store');
            $q->whereIn('f.id',$ids);
        }
        $start=(string)($this->request->getGet('inicio')??'');
        $end=(string)($this->request->getGet('fim')??'');
        if($start!==''||$end!==''){
            if(!$this->validateDate($start)||!$this->validateDate($end)||$start>$end){
                return $this->errorResponse(422,'Informe um intervalo de datas válido.');
            }
            $q->where('f.fim >=',$start)->where('f.inicio <=',$end);
        }
        $rows=$q->orderBy('f.fim','DESC')->orderBy('f.id','DESC')->limit(150)
            ->get()->getResultArray();
        foreach($rows as &$row){
            $row['id']=(int)$row['id'];
            if(!$actor['admin'])unset($row['responsavel_pessoa_id']);
        }unset($row);
        return $this->response->setJSON([
            'fechamentos'=>$rows,'administrador'=>$actor['admin'],
        ])->setHeader('Cache-Control','no-store');
    }

    public function acertoSemanal(int|string $id): ResponseInterface
    {
        $actor=$this->actor();if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $period=$this->authorizedPeriod($db,(int)$id,$actor);
        if($period instanceof ResponseInterface)return $period;

        try {
            $sales=$db->table('fechamento_periodo_vendas f')
                ->select('v.id,v.corretor_pessoa_id,v.numero_titulo,v.sigla_plano,v.data_venda,v.comissao_prevista,v.comissao_ajustada,p.nome AS titular_nome,c.nome AS cliente_nome')
                ->join('venda_operacoes v','v.id=f.operacao_id')
                ->join('pessoas p','p.id=v.corretor_pessoa_id')
                ->join('clientes c','c.id=v.cliente_id')
                ->where('f.fechamento_id',(int)$id)
                ->orderBy('v.data_venda')->orderBy('v.id')->get()->getResultArray();
            $ids=array_map(static fn($x)=>(int)$x['id'],$sales);
            $rateios=[];$ownerMov=[];$rateMov=[];
            if($ids){
                $rateios=$db->table('comissao_rateios r')
                    ->select('r.id,r.operacao_id,r.responsavel_pessoa_id,r.beneficiario_pessoa_id,r.papel,r.valor,p.nome AS beneficiario_nome')
                    ->join('pessoas p','p.id=r.beneficiario_pessoa_id')
                    ->whereIn('r.operacao_id',$ids)->orderBy('r.id')->get()->getResultArray();
                $ownerMov=$db->table('comissao_titular_movimentos')
                    ->select('operacao_id,tipo,valor,forma_id')->whereIn('operacao_id',$ids)->get()->getResultArray();
                $rid=array_map(static fn($x)=>(int)$x['id'],$rateios);
                if($rid){
                    $rateMov=$db->table('comissao_repasses')
                        ->select('rateio_id,tipo,valor,forma_id')->whereIn('rateio_id',$rid)->get()->getResultArray();
                }
            }
            $internal=$db->table('venda_formas_pagamento')
                ->select('id')->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
            $result=RelatorioAcertoSemanal::calcular(
                $sales,$rateios,$ownerMov,$rateMov,(int)($internal['id']??0)
            );
            $header=[
                'id'=>(int)$period['id'],
                'inicio'=>$period['inicio'],'fim'=>$period['fim'],
                'concluido_em'=>$period['concluido_em'],
                'status'=>'CONCLUIDO',
            ];
            $snapshot=json_decode((string)($period['resumo_concluido']??''),true);
            if(!is_array($snapshot))$snapshot=[];
            if(!$actor['admin']){
                $individual=RelatorioAcertoSemanal::individual($result,$actor['pessoa_id']);
                $ownExpenses='0.00';
                foreach(($snapshot['corretores']??[]) as $person){
                    if((int)($person['pessoa_id']??0)===$actor['pessoa_id']){
                        $ownExpenses=(string)($person['despesas']??'0.00');
                        break;
                    }
                }
                $ownLoans=[];
                foreach(($snapshot['emprestimos']??[]) as $loan){
                    if((int)($loan['pessoa_id']??0)!==$actor['pessoa_id'])continue;
                    $ownLoans[]=[
                        'id'=>(int)$loan['id'],
                        'descricao'=>$loan['descricao'],
                        'valor'=>$loan['valor'],
                        'saldo'=>$loan['saldo'],
                    ];
                }
                // Este usuário recebe exclusivamente suas parcelas, suas despesas e
                // seus empréstimos, sem nomes de clientes, outras pessoas ou caixa do clube.
                return $this->response->setJSON([
                    'administrador'=>false,'fechamento'=>$header,
                    'pessoas'=>$individual['pessoas'],
                    'vendas'=>[],
                    'despesas_proprias'=>$ownExpenses,'emprestimos_proprios'=>$ownLoans,
                    'aviso'=>'Demonstrativo individual liberado somente após a conclusão do fechamento pelo responsável. A entrada do clube não é um pagamento à sua pessoa.',
                ])->setHeader('Cache-Control','no-store');
            }
            return $this->response->setJSON([
                'administrador'=>true,
                'fechamento'=>[...$header,'responsavel_nome'=>$period['responsavel_nome']],
                'resumo'=>$snapshot['resumo']??[],
                'pessoas'=>$result['pessoas'],
                'vendas'=>$result['vendas'],
                'entradas'=>$snapshot['entradas']??[],
                'despesas_por_corretor'=>array_map(static fn($p)=>[
                    'pessoa_id'=>$p['pessoa_id'],'nome'=>$p['nome'],
                    'despesas'=>$p['despesas']??'0.00',
                    'abatido'=>$p['abatido']??'0.00',
                ],$snapshot['corretores']??[]),
                'aviso'=>'Recebimentos do clube, despesas, pagamentos e abatimentos são eventos distintos. O fechamento concluído é somente leitura.',
            ])->setHeader('Cache-Control','no-store');
        } catch(Throwable $e) {
            return $this->unexpected($e,'relatório semanal de fechamento');
        }
    }
}
