<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

/** A edição do rateio continua exclusiva do admin e segue a auditoria web. */
final class MobileRateiosController extends FechamentosController
{
    protected function authorizeAdmin(): ?ResponseInterface
    {
        $user=auth('tokens')->user();
        if(!$user || $user->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        if(!$user->inGroup('admin'))return $this->errorResponse(403,'Apenas o administrador pode alterar as participações.');
        return null;
    }
}
