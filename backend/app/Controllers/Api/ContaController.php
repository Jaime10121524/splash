<?php
declare(strict_types=1);
namespace App\Controllers\Api;
use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
final class ContaController extends BaseController
{
    private function answer(array $data,int $code=200):ResponseInterface {
        return $this->response->setStatusCode($code)->setJSON($data)->setHeader('Cache-Control','no-store');
    }
    private function currentUser(){
        $u=auth('session')->user();
        return $u && !$u->isBanned()?$u:null;
    }
    private function validPassword(string $s):bool{
        return strlen($s)>=8&&strlen($s)<=128&&preg_match('/[A-Z]/',$s)&&preg_match('/[0-9]/',$s);
    }
    public function perfil():ResponseInterface{
        $u=$this->currentUser();
        if(!$u)return $this->answer(['message'=>'Sessão expirada.'],401);
        return $this->answer(['perfil'=>['username'=>$u->username,'email'=>$u->email]]);
    }
}
