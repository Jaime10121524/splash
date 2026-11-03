<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\I18n\Time;

/**
 * Endpoints exclusivos do aplicativo React Native.
 *
 * O site mantém suas sessões Shield e proteção CSRF. O aplicativo usa
 * somente tokens Shield com escopo "mobile", enviados em Authorization.
 * Nunca reutilizar este token para liberar rotas da sessão web.
 */
final class MobileController extends BaseController
{
    private function noCache(ResponseInterface $response): ResponseInterface
    {
        return $response->setHeader('Cache-Control', 'no-store');
    }

    private function error(int $code, string $message): ResponseInterface
    {
        return $this->noCache($this->response->setStatusCode($code)->setJSON(['message' => $message]));
    }

    private function safeUser($user): array
    {
        return [
            'id' => (int) $user->id,
            'username' => (string) $user->username,
            'role' => $user->inGroup('admin') ? 'admin'
                : ($user->inGroup('corretor') ? 'corretor'
                : ($user->inGroup('vendedor') ? 'vendedor'
                : ($user->inGroup('gerente') ? 'gerente'
                : ($user->inGroup('operador') ? 'operador' : 'restrito')))),
            'groups' => $user->getGroups(),
        ];
    }

    public function ping(): ResponseInterface
    {
        // Sem dados privados: teste simples de alcance da API em desenvolvimento.
        return $this->noCache($this->response->setJSON(['ok' => true]));
    }

    public function login(): ResponseInterface
    {
        // API mobile stateless: rate limit separado, sem cookies nem tokens CSRF.
        $payload = $this->request->getJSON(true);
        if (! is_array($payload)) return $this->error(422, 'Dados de acesso inválidos.');

        $username = trim((string) ($payload['username'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        if ($username === '' || $password === '' || mb_strlen($username) > 100) {
            return $this->error(422, 'Informe seu usuário e senha.');
        }

        $ip = $this->request->getIPAddress();
        $key = 'splash-native-login-' . sha1($ip . strtolower($username));
        // Também limita por IP: variar nomes de usuário não contorna o bloqueio.
        if (! service('throttler')->check('splash-native-ip-' . sha1($ip), 10, MINUTE)
            || ! service('throttler')->check($key, 5, MINUTE)) {
            return $this->error(429, 'Muitas tentativas. Tente novamente em alguns instantes.');
        }

        // Usa o validador de senhas oficial do Shield, não cria login paralelo.
        $authenticator = auth('session')->getAuthenticator();
        $result = $authenticator->attempt(['username' => $username, 'password' => $password]);
        if (! $result->isOK()) return $this->error(401, 'Usuário ou senha inválidos.');

        $user = auth('session')->user();
        if ($user === null || $user->isBanned()) {
            auth('session')->logout();
            service('security')->generateHash();
            return $this->error(403, 'Acesso bloqueado.');
        }

        // Token limitado ao app e com expiração real; nunca salvar senha no aparelho.
        try {
            $deviceName = trim((string) ($payload['device_name'] ?? 'Android/iOS'));
            $deviceName = mb_substr($deviceName, 0, 50);
            $token = $user->generateAccessToken(
                'Splash Mobile - ' . ($deviceName ?: 'Dispositivo'),
                ['mobile'],
                Time::now()->addDays(30)
            );
            $safe = $this->safeUser($user);
        } finally {
            // O endpoint nativo NÃO mantém sessão web autenticada.
            auth('session')->logout();
            service('security')->generateHash();
        }

        return $this->noCache($this->response->setJSON([
            'token' => $token->raw_token,
            'user' => $safe,
        ]));
    }

    public function me(): ResponseInterface
    {
        $user = auth('tokens')->user();
        if ($user === null || $user->isBanned()) return $this->error(401, 'Sessão expirada.');
        return $this->noCache($this->response->setJSON(['user' => $this->safeUser($user)]));
    }

    public function logout(): ResponseInterface
    {
        $user = auth('tokens')->user();
        $header = $this->request->getHeaderLine('Authorization');
        if ($user !== null && preg_match('/^Bearer\s+([a-zA-Z0-9]+)$/iD', $header, $matches)) {
            $user->revokeAccessToken($matches[1]);
        }
        return $this->noCache($this->response->setJSON(['message' => 'Sessão encerrada.']));
    }

    public function atendimentos(): ResponseInterface
    {
        $user = auth('tokens')->user();
        if ($user === null || $user->isBanned()) return $this->error(401, 'Sessão expirada.');
        if (! $user->inGroup('admin', 'operador', 'gerente', 'corretor')) {
            return $this->error(403, 'Seu perfil não possui acesso a atendimentos.');
        }

        $periodo = (string) ($this->request->getGet('periodo') ?? 'hoje');
        if (! in_array($periodo, ['hoje', 'todos'], true)) {
            return $this->error(422, 'Filtro de período inválido.');
        }

        $db = db_connect();
        $scope = null;
        if ($user->inGroup('corretor') && ! $user->inGroup('admin', 'gerente', 'operador')) {
            $person = $db->table('pessoas')->select('id')
                ->where('user_id', (int) $user->id)->where('ativo', 1)->get()->getRowArray();
            if (! $person) return $this->error(403, 'Conta sem pessoa ativa vinculada.');
            $scope = (int) $person['id'];
        }

        // Mesma regra de isolamento da API web: corretor só vê visitas suas
        // ou por ele cadastradas; as contas administrativas têm escopo total.
        $build = static function () use ($db, $scope, $user, $periodo) {
            $query = $db->table('visitas v');
            if ($scope !== null) {
                $query->groupStart()->where('v.corretor_pessoa_id', $scope)
                    ->orWhere('v.segundo_corretor_pessoa_id', $scope)
                    ->orWhere('v.criado_por_usuario_id', (int) $user->id)->groupEnd();
            }
            if ($periodo === 'hoje') {
                $query->where('v.chegada_em >=', date('Y-m-d') . ' 00:00:00')
                    ->where('v.chegada_em <=', date('Y-m-d') . ' 23:59:59');
            }
            return $query;
        };

        $stats = $build()->select("
            COUNT(*) AS total,
            SUM(CASE WHEN v.status='AGUARDANDO' THEN 1 ELSE 0 END) AS aguardando,
            SUM(CASE WHEN v.status='ATENDENDO' THEN 1 ELSE 0 END) AS atendendo,
            SUM(CASE WHEN v.status='PENDENCIA' THEN 1 ELSE 0 END) AS pendencia,
            SUM(CASE WHEN v.status='VENDA' THEN 1 ELSE 0 END) AS venda,
            SUM(CASE WHEN v.status='RETORNO' THEN 1 ELSE 0 END) AS retorno,
            SUM(CASE WHEN v.status='SEM_VENDA' THEN 1 ELSE 0 END) AS sem_venda,
            SUM(CASE WHEN v.status='CANCELADA' THEN 1 ELSE 0 END) AS canceladas
        ", false)->get()->getRowArray() ?? [];

        $visitas = $build()->select('v.id, v.cliente_id, v.status, v.chegada_em,
            v.inicio_em, v.fim_em, v.retorno_previsto, v.observacoes,
            c.nome AS cliente_nome, c.telefone AS cliente_telefone,
            p.nome AS atendente_nome, cp.nome AS corretor_nome')
            ->join('clientes c', 'c.id = v.cliente_id')
            ->join('pessoas p', 'p.id = v.atendente_pessoa_id', 'left')
            ->join('pessoas cp', 'cp.id = v.corretor_pessoa_id', 'left')
            ->orderBy('v.id', 'DESC')->limit(100)->get()->getResultArray();

        foreach ($visitas as &$visita) {
            $visita['id'] = (int) $visita['id'];
            $visita['cliente_id'] = (int) $visita['cliente_id'];
        }
        unset($visita);

        return $this->noCache($this->response->setJSON([
            'visitas' => $visitas,
            'indicadores' => [
                'total' => (int) ($stats['total'] ?? 0),
                'aguardando' => (int) ($stats['aguardando'] ?? 0),
                'atendendo' => (int) ($stats['atendendo'] ?? 0),
                'pendencia' => (int) ($stats['pendencia'] ?? 0),
                'venda' => (int) ($stats['venda'] ?? 0),
                'retorno' => (int) ($stats['retorno'] ?? 0),
                'sem_venda' => (int) ($stats['sem_venda'] ?? 0),
                'canceladas' => (int) ($stats['canceladas'] ?? 0),
            ],
            'limite_lista' => 100,
        ]));
    }
}
