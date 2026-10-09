<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;

class SessionController extends BaseController
{

    public function show()
    {
        $user = auth('session')->user();

        return $this->response->setJSON([
            'authenticated' => $user !== null,
            'user' => $user === null ? null : $this->safeUser($user),
            'csrf' => $this->csrf(),
        ])->setHeader('Cache-Control', 'no-store');
    }

    public function login()
    {
        // Tentativas em excesso são bloqueadas por IP. Nenhum endpoint é público para criação de contas.
        $throttler = service('throttler');
        if (! $throttler->check('splash-login-' . sha1($this->request->getIPAddress()), 8, MINUTE)) {
            return $this->response->setStatusCode(429)->setJSON([
                'message' => 'Muitas tentativas. Tente novamente em alguns instantes.',
                'csrf' => $this->csrf(),
            ]);
        }

        $data = $this->request->getJSON(true);
        if (! is_array($data)) {
            $data = $this->request->getPost();
        }

        $username = trim((string) ($data['username'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        if ($username === '' || $password === '' || strlen($username) > 100) {
            return $this->response->setStatusCode(422)->setJSON([
                'message' => 'Informe seu usuário e sua senha.',
                'csrf' => $this->csrf(),
            ]);
        }

        $authenticator = auth('session')->getAuthenticator();
        $result = $authenticator->attempt([
            'username' => $username,
            'password' => $password,
        ]);

        if (! $result->isOK()) {
            return $this->response->setStatusCode(401)->setJSON([
                'message' => 'Usuário ou senha inválidos.',
                'csrf' => $this->csrf(),
            ]);
        }

        // Mantém sessão no servidor: o frontend nunca armazena credenciais/tokens de autenticação.
        $user = auth('session')->user();

        return $this->response->setJSON([
            'authenticated' => true,
            'user' => $this->safeUser($user),
            'csrf' => $this->csrf(),
        ])->setHeader('Cache-Control', 'no-store');
    }

    public function logout()
    {
        auth('session')->logout();

        return $this->response->setJSON([
            'authenticated' => false,
            'user' => null,
            'csrf' => $this->csrf(),
        ])->setHeader('Cache-Control', 'no-store');
    }

    private function safeUser($user): array
    {
        $groups = $user->getGroups();

        return [
            'id' => (int) $user->id,
            'username' => (string) $user->username,
            'role' => $user->inGroup('admin') ? 'admin'
                : ($user->inGroup('corretor') ? 'corretor'
                : ($user->inGroup('vendedor') ? 'vendedor'
                : ($user->inGroup('gerente') ? 'gerente' : 'restrito'))),
            'groups' => $groups,
        ];
    }

    private function csrf(): array
    {
        return [
            'header' => config('Security')->headerName,
            'hash' => csrf_hash(),
        ];
    }
}
