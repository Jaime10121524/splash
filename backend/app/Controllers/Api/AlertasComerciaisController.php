<?php
declare(strict_types=1);
namespace App\Controllers\Api;
use CodeIgniter\HTTP\ResponseInterface;

final class AlertasComerciaisController extends CommercialBaseController
{
    public function consultar(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $row=db_connect()->table('splash_alertas_config')->where('id',1)->get()->getRowArray();
        return $this->response->setJSON(['config'=>$row])->setHeader('Cache-Control','no-store');
    }
    public function salvar(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $body=$this->jsonPayload();
        $days=trim((string)($body['titulos_dias']??''));
        if(!preg_match('/^\d{1,3}(,\d{1,3}){0,9}$/D',$days))
            return $this->errorResponse(422,'Informe prazos separados por vírgulas, de 0 a 365 dias.');
        $list=array_map('intval',explode(',',$days));
        if(count(array_unique($list))!==count($list)||min($list)<0||max($list)>365)
            return $this->errorResponse(422,'Prazos repetidos ou fora de 0 a 365.');
        rsort($list);
        $pending=filter_var($body['pendencias_dias']??null,FILTER_VALIDATE_INT,
            ['options'=>['min_range'=>1,'max_range'=>365]]);
        $ret=filter_var($body['retornos_antecedencia_dias']??null,FILTER_VALIDATE_INT,
            ['options'=>['min_range'=>0,'max_range'=>30]]);
        if($pending===false||$ret===false)return $this->errorResponse(422,'Prazos inválidos.');
        db_connect()->table('splash_alertas_config')->where('id',1)->update([
            'titulos_dias'=>implode(',',$list),'pendencias_dias'=>$pending,
            'retornos_antecedencia_dias'=>$ret,
            'ativo'=>!empty($body['ativo'])?1:0,
            'atualizado_em'=>date('Y-m-d H:i:s'),
        ]);
        return $this->responseOK('Prazos dos alertas atualizados.');
    }
}
