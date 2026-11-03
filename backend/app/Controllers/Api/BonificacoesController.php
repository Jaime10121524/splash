<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\BonificacaoIndicacao;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

final class BonificacoesController extends BaseController
{
    private function error(int $code,string $message): ResponseInterface
    {
        return $this->response->setStatusCode($code)->setJSON(['message'=>$message])
            ->setHeader('Cache-Control','no-store');
    }

    private function actor(): array|ResponseInterface
    {
        $user=str_starts_with(strtolower($this->request->getHeaderLine('Authorization')),'bearer ')
            ? auth('tokens')->user() : auth('session')->user();
        if (!$user || $user->isBanned()) return $this->error(401,'Entre novamente.');
        if (!$user->inGroup('admin','corretor','gerente','operador')) return $this->error(403,'Sem permissão.');
        $admin=$user->inGroup('admin');
        $scope=null;
        if (!$admin && $user->inGroup('corretor') && !$user->inGroup('gerente','operador')) {
            $person=db_connect()->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if (!$person) return $this->error(403,'Pessoa não vinculada.');
            $scope=(int)$person['id'];
        }
        return ['user'=>$user,'admin'=>$admin,'scope'=>$scope];
    }

    public function index(): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        $db=db_connect();
        $query=$db->table('indicacao_bonificacoes b')
            ->select('b.*,ci.nome AS indicado_nome,cd.nome AS indicador_nome,p.nome AS conta_nome')
            ->join('clientes ci','ci.id=b.cliente_indicado_id')
            ->join('clientes cd','cd.id=b.indicador_cliente_id')
            ->join('pessoas p','p.id=b.pessoa_financeira_id');
        if($actor['scope']!==null)$query->where('b.pessoa_financeira_id',$actor['scope']);
        $rows=$query->orderBy('b.id','DESC')->limit(200)->get()->getResultArray();
        return $this->response->setJSON(['bonificacoes'=>$rows,'admin'=>$actor['admin']])
            ->setHeader('Cache-Control','no-store');
    }

    public function pagar(int|string $id): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        if(!$actor['admin'])return $this->error(403,'Somente o administrador pode confirmar pagamento.');
        $valid=filter_var($id,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($valid===false)return $this->error(404,'Bonificação não encontrada.');
        $db=db_connect();
        $db->transBegin();
        try {
            $error=BonificacaoIndicacao::pagar($db,(int)$valid,$actor['user']);
            if($error!==null){$db->transRollback();return $this->error(409,$error);}
            if($db->transStatus()===false)throw new \RuntimeException('Falha na transação.');
            $db->transCommit();
            return $this->response->setJSON(['message'=>'Pagamento confirmado e despesa lançada no financeiro.'])
                ->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){
            $db->transRollback();
            log_message('error','Confirmar bonificação: '.$e->getMessage());
            return $this->error(500,'Não foi possível confirmar pagamento.');
        }
    }
}
