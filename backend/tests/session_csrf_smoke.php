<?php
declare(strict_types=1);

// Teste isolado da transição de sessão no controller. Não usa banco de dados
// e não emite requisições de login nem credenciais.
namespace App\Controllers {
    class BaseController
    {
        public \FakeResponse $response;

        public function __construct()
        {
            $this->response = new \FakeResponse();
        }
    }
}

namespace {
    final class FakeResponse
    {
        public array $data = [];

        public function setJSON(array $data): self
        {
            $this->data = $data;

            return $this;
        }

        public function setHeader(string $header, string $value): self
        {
            return $this;
        }
    }

    final class FakeUser
    {
        public function isBanned(): bool
        {
            return true;
        }
    }

    final class FakeAuth
    {
        public ?FakeUser $current = null;

        public function logout(): void
        {
            // O Shield limpa TODOS os dados da sessão, inclusive CSRF.
            $GLOBALS['sessionState'] = [];
            $this->current = null;
        }

        public function user(): ?FakeUser
        {
            return $this->current;
        }
    }

    final class FakeSecurity
    {
        public string $hash = '';
        private int $generation = 0;

        public function generateHash(): string
        {
            $this->hash = 'newcsrf-'.++$this->generation;
            $GLOBALS['sessionState']['csrf_test_name'] = $this->hash;

            return $this->hash;
        }
    }

    function auth(string $name = 'session'): FakeAuth
    {
        return $GLOBALS['fakeAuth'];
    }

    function service(string $name): FakeSecurity
    {
        if ($name !== 'security') {
            throw new \RuntimeException('Serviço inesperado: '.$name);
        }

        return $GLOBALS['fakeSecurity'];
    }

    function config(string $name): object
    {
        if ($name !== 'Security') {
            throw new \RuntimeException('Configuração inesperada: '.$name);
        }

        return (object) ['headerName'=>'X-CSRF-TOKEN'];
    }

    function csrf_hash(): string
    {
        return $GLOBALS['fakeSecurity']->hash;
    }

    require_once dirname(__DIR__).'/app/Controllers/Api/SessionController.php';

    $GLOBALS['fakeAuth'] = new FakeAuth();
    $GLOBALS['fakeSecurity'] = new FakeSecurity();
    $GLOBALS['sessionState'] = ['csrf_test_name'=>'oldcsrf','user'=>123];
    $GLOBALS['fakeSecurity']->hash = 'oldcsrf';

    $controller = new \App\Controllers\Api\SessionController();
    $controller->logout();

    $logout = $controller->response->data;
    if (($logout['authenticated']??null)!==false
        || ($logout['csrf']['hash']??null)==='oldcsrf'
        || ($logout['csrf']['hash']??null)!==$GLOBALS['sessionState']['csrf_test_name']) {
        throw new \RuntimeException('Logout devolveu CSRF que não pertence à nova sessão.');
    }

    // Uma pessoa bloqueada pode disparar logout em GET /api/session.
    // O token retornado também deve estar realmente persistido.
    $GLOBALS['sessionState'] = ['csrf_test_name'=>'before-ban','user'=>456];
    $GLOBALS['fakeSecurity']->hash = 'before-ban';
    $GLOBALS['fakeAuth']->current = new FakeUser();

    $controller = new \App\Controllers\Api\SessionController();
    $controller->show();
    $banned = $controller->response->data;
    if (($banned['authenticated']??null)!==false
        || ($banned['csrf']['hash']??null)==='before-ban'
        || ($banned['csrf']['hash']??null)!==$GLOBALS['sessionState']['csrf_test_name']) {
        throw new \RuntimeException('GET /api/session após bloqueio devolveu CSRF inválido.');
    }

    echo "CSRF após logout e usuário bloqueado: 2 verificações OK\n";
}
