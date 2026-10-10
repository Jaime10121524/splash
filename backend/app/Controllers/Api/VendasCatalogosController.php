<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

class VendasCatalogosController extends CommercialBaseController
{
    public function regra(int|string|null $id=null): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $data=$this->jsonPayload();
        $name=$this->cleanText($data['nome']??null,100,true);
        $mode=(string)($data['modalidade']??'');
        $num=filter_var($data['numerador']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>1000]]);
        $den=filter_var($data['denominador']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>1000]]);
        $discount=(string)($data['desconto_cartao']??'');
        if($name===false || !in_array($mode,['AVISTA','CARTAO','MISTO'],true)
            ||$num===false||$den===false||$num>$den
            ||!preg_match('/^(?:0|[1-9]\d?)(?:\.\d{1,3})?$|^100(?:\.0{1,3})?$/D',$discount)
            ||!isset($data['ativo'])||!is_bool($data['ativo'])){
            return $this->errorResponse(422,'Revise nome, tipo, fração da comissão, desconto (0 a 100%) e situação.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $insert=[
                'nome'=>$name,'modalidade'=>$mode,'numerador'=>(int)$num,'denominador'=>(int)$den,
                'desconto_cartao'=>$discount,'ativo'=>$data['ativo']?1:0,
            ];
            if($id===null){
                $db->table('venda_regras_comissao')->insert($insert);
            }else{
                if(!$db->table('venda_regras_comissao')->where('id',(int)$id)->countAllResults()){
                    $db->transRollback();return $this->errorResponse(404,'Regra não encontrada.');
                }
                // O snapshot completo na venda protege todos os cálculos históricos.
                $db->table('venda_regras_comissao')->where('id',(int)$id)->update($insert);
            }
            $this->commitOrFail($db);
            return $this->responseOK('Regra de comissão salva.', $id===null?201:200);
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'cadastrar regra');}
    }

    public function forma(int|string|null $id=null): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $data=$this->jsonPayload();
        $name=$this->cleanText($data['nome']??null,80,true);
        $code=strtoupper(trim((string)($data['codigo']??'')));
        if($name===false||!preg_match('/^[A-Z0-9_]{2,25}$/D',$code)
            ||!isset($data['credito'])||!is_bool($data['credito'])
            ||!isset($data['ativo'])||!is_bool($data['ativo'])){
            return $this->errorResponse(422,'Informe descrição, código, cartão de crédito e situação válidos.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $row=$id===null?null:$db->table('venda_formas_pagamento')->where('id',(int)$id)->get()->getRowArray();
            if($id!==null&&!$row){$db->transRollback();return $this->errorResponse(404,'Forma não encontrada.');}
            if($row && in_array($row['codigo'],['PIX','CREDITO'],true)
                && ($code!==$row['codigo'] || (bool)$data['credito']!==(bool)$row['credito'])){
                $db->transRollback();return $this->errorResponse(409,'A natureza das formas Pix e Crédito deve ser preservada.');
            }
            $duplicate=$db->table('venda_formas_pagamento')->where('codigo',$code)->get()->getRowArray();
            if($duplicate && ($row===null || (int)$duplicate['id']!==(int)$row['id'])){
                $db->transRollback();return $this->errorResponse(409,'Já existe essa forma de pagamento.');
            }
            $insert=['nome'=>$name,'codigo'=>$code,'credito'=>$data['credito']?1:0,'ativo'=>$data['ativo']?1:0];
            if($id===null)$db->table('venda_formas_pagamento')->insert($insert);
            else $db->table('venda_formas_pagamento')->where('id',(int)$id)->update($insert);
            $this->commitOrFail($db);
            return $this->responseOK('Forma de pagamento salva.', $id===null?201:200);
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e,'cadastrar forma');}
    }
}
