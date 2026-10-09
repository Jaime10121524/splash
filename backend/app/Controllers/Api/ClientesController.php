<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\ClienteRules;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

class ClientesController extends CommercialBaseController
{
    public function index(): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;
        $q=trim((string)$this->request->getGet('q'));
        if (mb_strlen($q)>120)return $this->errorResponse(422,'Pesquisa muito longa.');
        $page=max(1,min(100000,(int)($this->request->getGet('page')?:1)));
        $limit=max(1,min(100,(int)($this->request->getGet('limit')?:25)));

        $db=db_connect();
        $builder=$db->table('clientes c')
            ->select('c.*, o.nome AS origem_nome, p.nome AS dono_corrente_nome, i.nome AS indicador_nome')
            ->join('lead_origens o','o.id=c.origem_id','left')
            ->join('pessoas p','p.id=c.dono_corrente_pessoa_id','left')
            ->join('clientes i','i.id=c.indicador_cliente_id','left');
        if($q!=='') {
            $digits=preg_replace('/\D/','',$q);
            $builder->groupStart()->like('c.nome',$q);
            if(strlen($digits)>=3) {
                $builder->orLike('c.telefone',$digits)->orLike('c.cpf',$digits);
            }
            $builder->groupEnd();
        }
        $total=$builder->countAllResults(false);
        $rows=$builder->orderBy('c.id','DESC')->limit($limit,($page-1)*$limit)
            ->get()->getResultArray();
        foreach($rows as &$row){
            $row['id']=(int)$row['id'];
            $row['ativo']=(bool)$row['ativo'];
            foreach(['origem_id','indicador_cliente_id','dono_corrente_pessoa_id'] as $field){
                $row[$field]=$row[$field]===null?null:(int)$row[$field];
            }
        }
        unset($row);
        return $this->response->setJSON([
            'clientes'=>$rows,'total'=>(int)$total,'page'=>$page,'limit'=>$limit,
        ])->setHeader('Cache-Control','no-store');
    }

    public function create(): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;
        $db=db_connect();
        $input=$this->jsonPayload();
        $clean=ClienteRules::validate($db,$input);
        if(isset($clean['error']))return $this->errorResponse(422,$clean['error']);

        $db->transBegin();
        try{
            $now=date('Y-m-d H:i:s');
            $db->table('clientes')->insert([
                ...$clean,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$now,
            ]);
            $id=(int)$db->insertID();
            if($id<1)throw new \RuntimeException('Falha no cadastro.');
            $this->insertOwnerEvent($db,$id,null,(int)$clean['dono_corrente_pessoa_id'],
                $clean['indicador_cliente_id']?'INDICACAO':'CADASTRO',null);
            $this->commitOrFail($db);
            return $this->responseOK('Cliente cadastrado.',201,['cliente_id'=>$id]);
        } catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'cadastro cliente');
        }
    }

    public function update(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;
        $db=db_connect();
        $db->transBegin();
        try{
            $old=$db->query('SELECT * FROM clientes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$old){
                $db->transRollback();
                return $this->errorResponse(404,'Cliente não encontrado.');
            }
            $input=$this->jsonPayload();
            $clean=ClienteRules::validate($db,$input,$old);
            if(isset($clean['error'])){
                $db->transRollback();
                return $this->errorResponse(422,$clean['error']);
            }
            $changedOwner=(int)$old['dono_corrente_pessoa_id']!==(int)$clean['dono_corrente_pessoa_id'];
            $changedReferral=($old['indicador_cliente_id']===null?null:(int)$old['indicador_cliente_id'])!==$clean['indicador_cliente_id'];
            $db->table('clientes')->where('id',(int)$id)
                ->update([...$clean,'atualizado_em'=>date('Y-m-d H:i:s')]);
            if($changedOwner){
                $reason=$changedReferral?'INDICACAO':'AJUSTE_MANUAL';
                $this->insertOwnerEvent($db,(int)$id,(int)$old['dono_corrente_pessoa_id'],
                    (int)$clean['dono_corrente_pessoa_id'],$reason,
                    $reason==='AJUSTE_MANUAL'?trim((string)($input['motivo_corrente']??'')):null);
            }
            $this->commitOrFail($db);
            return $this->responseOK('Cliente atualizado.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'alteração cliente');
        }
    }

    public function corrente(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;
        $db=db_connect();
        if (!$db->table('clientes')->where('id',(int)$id)->countAllResults()) {
            return $this->errorResponse(404,'Cliente não encontrado.');
        }
        $history=$db->table('cliente_corrente_historico h')
            ->select('h.*, p.nome AS dono_anterior_nome, n.nome AS dono_novo_nome')
            ->join('pessoas p','p.id=h.dono_anterior_pessoa_id','left')
            ->join('pessoas n','n.id=h.dono_novo_pessoa_id','left')
            ->where('h.cliente_id',(int)$id)
            ->orderBy('h.id','DESC')->get()->getResultArray();
        return $this->response->setJSON(['historico'=>$history])
            ->setHeader('Cache-Control','no-store');
    }

    private function insertOwnerEvent($db,int $id,?int $before,int $after,string $reason,?string $justification): void
    {
        $db->table('cliente_corrente_historico')->insert([
            'cliente_id'=>$id,'dono_anterior_pessoa_id'=>$before,
            'dono_novo_pessoa_id'=>$after,'origem'=>$reason,
            'justificativa'=>$justification,
            'usuario_id'=>(int)auth('session')->user()->id,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
    }
}
