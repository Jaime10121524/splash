<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

class CatalogosController extends CommercialBaseController
{
    public function index(): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;

        $db=db_connect();
        $origens=$db->table('lead_origens')->orderBy('nome','ASC')->get()->getResultArray();
        $motivos=$db->table('motivos_nao_venda')->orderBy('descricao','ASC')->get()->getResultArray();

        // Retornamos somente os campos operacionais necessários, nunca credenciais.
        $people=$db->table('pessoas p')
            ->select('p.id,p.nome,p.ativo,pp.papel')
            ->join('pessoa_papeis pp','pp.pessoa_id=p.id','inner')
            ->orderBy('p.nome','ASC')->get()->getResultArray();
        $pessoas=[];
        foreach($people as $row) {
            $id=(int)$row['id'];
            if(!isset($pessoas[$id])) $pessoas[$id]=[
                'id'=>$id,'nome'=>$row['nome'],'ativo'=>(bool)$row['ativo'],'papeis'=>[],
            ];
            $pessoas[$id]['papeis'][]=$row['papel'];
        }
        foreach($origens as &$row) $row['ativo']=(bool)$row['ativo'];
        unset($row);
        foreach($motivos as &$row) $row['ativo']=(bool)$row['ativo'];
        unset($row);

        return $this->response->setJSON([
            'origens'=>$origens, 'motivos'=>$motivos,'pessoas'=>array_values($pessoas),
        ])->setHeader('Cache-Control','no-store');
    }

    public function criarOrigem(): ResponseInterface
    {
        return $this->save('lead_origens','nome',null);
    }

    public function editarOrigem(int|string $id): ResponseInterface
    {
        return $this->save('lead_origens','nome',(int)$id);
    }

    public function criarMotivo(): ResponseInterface
    {
        return $this->save('motivos_nao_venda','descricao',null);
    }

    public function editarMotivo(int|string $id): ResponseInterface
    {
        return $this->save('motivos_nao_venda','descricao',(int)$id);
    }

    private function save(string $table,string $field,?int $id): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;
        $data=$this->jsonPayload();
        $name=$this->cleanText($data[$field]??null,90,true);
        if ($name===false) return $this->errorResponse(422,'Informe uma descrição de até 90 caracteres.');
        if (!isset($data['ativo']) || !is_bool($data['ativo'])) {
            return $this->errorResponse(422,'Informe se o cadastro está ativo.');
        }
        $db=db_connect();
        $already=$db->table($table)->where($field,$name)->get()->getRowArray();
        if ($already && ($id===null || (int)$already['id']!==$id)) {
            return $this->errorResponse(409,'Já existe um cadastro com essa descrição.');
        }
        $db->transBegin();
        try {
            if ($id === null) {
                $db->table($table)->insert([
                    $field=>$name,'ativo'=>$data['ativo']?1:0,'criado_em'=>date('Y-m-d H:i:s'),
                ]);
            } else {
                if (!$db->table($table)->where('id',$id)->countAllResults()) {
                    $db->transRollback();
                    return $this->errorResponse(404,'Cadastro não encontrado.');
                }
                $db->table($table)->where('id',$id)->update([
                    $field=>$name,'ativo'=>$data['ativo']?1:0,
                ]);
            }
            $this->commitOrFail($db);
            return $this->responseOK($id===null?'Cadastro incluído.':'Cadastro atualizado.', $id===null?201:200);
        } catch(Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e,'catálogo comercial');
        }
    }
}
