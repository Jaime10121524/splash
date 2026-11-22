<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\GestaoEquipe;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Rateio visível/editável para o administrador e para o gestor da venda.
 * Nunca libera acesso por indicação de ID sem conferir o escopo no servidor.
 * Mantém todas as travas de fechamento, quitação e auditoria herdadas do web.
 */
final class MobileRateiosController extends FechamentosController
{
    protected function authorizeAdmin(): ?ResponseInterface
    {
        $user=auth('tokens')->user();
        if(!$user || $user->isBanned())
            return $this->errorResponse(401,'Sessão expirada.');
        if(!preg_match('~/api/mobile/vendas/([1-9][0-9]*)/rateios/?$~',
            (string)$this->request->getUri()->getPath(),$matches))
            return $this->errorResponse(403,'Rota de rateio não autorizada.');
        if($user->inGroup('admin'))return null;
        $db=db_connect();
        if(!GestaoEquipe::ehGestor($db,$user))
            return $this->errorResponse(403,'Somente o gestor da venda pode conferir as comissões de sua equipe.');
        $op=$db->table('venda_operacoes')->where('id',(int)$matches[1])->get()->getRowArray();
        if(!$op || !GestaoEquipe::podeGerirOperacao($db,$user,$op))
            return $this->errorResponse(404,'Venda não encontrada na sua equipe.');
        return null;
    }
}
