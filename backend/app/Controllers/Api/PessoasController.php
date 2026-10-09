<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Participantes do clube: pessoa física e papéis são independentes da conta Shield.
 * Todos os endpoints deste cadastro são exclusivos do administrador.
 */
class PessoasController extends BaseController
{
    private function authorize(): ?ResponseInterface
    {
        $user = auth('session')->user();
        if ($user === null) return $this->error(401, 'Faça login novamente.');
        if (! $user->inGroup('admin') || ! $user->can('users.manage')) {
            return $this->error(403, 'Você não tem permissão para gerenciar pessoas.');
        }
        return null;
    }

    public function index(): ResponseInterface
    {
        if ($denied = $this->authorize()) return $denied;

        $db = db_connect();
        $pessoas = $db->table('pessoas')->orderBy('nome','ASC')->get()->getResultArray();
        $rows = $db->table('pessoa_papeis')->get()->getResultArray();
        $roleMap = [];
        foreach ($rows as $role) $roleMap[(int)$role['pessoa_id']][] = $role['papel'];

        foreach ($pessoas as &$pessoa) {
            $pessoa['id'] = (int) $pessoa['id'];
            $pessoa['user_id'] = $pessoa['user_id'] === null ? null : (int)$pessoa['user_id'];
            $pessoa['ativo'] = (bool)$pessoa['ativo'];
            $pessoa['papeis'] = $roleMap[$pessoa['id']] ?? [];
        }
        unset($pessoa);

        return $this->response->setJSON(['pessoas'=>$pessoas])
            ->setHeader('Cache-Control','no-store');
    }

    public function create(): ResponseInterface
    {
        if ($denied = $this->authorize()) return $denied;
        $data = $this->request->getJSON(true);
        $clean = $this->validatePerson(is_array($data) ? $data : []);
        if (isset($clean['error'])) return $this->error(422, $clean['error']);

        $db = db_connect();
        $db->transBegin();
        try {
            $now = date('Y-m-d H:i:s');
            $roles = $clean['papeis'];
            unset($clean['papeis']);
            $db->table('pessoas')->insert([...$clean, 'criado_em'=>$now]);
            $id = (int)$db->insertID();
            if ($id < 1) throw new \RuntimeException('Pessoa não inserida.');
            $this->saveRoles($db, $id, $roles);
            $this->audit($db, $id, 'CRIAR', null, [...$clean,'papeis'=>$roles]);
            $this->commit($db);
            return $this->ok('Pessoa cadastrada.', 201);
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    public function update(int|string $id): ResponseInterface
    {
        if ($denied = $this->authorize()) return $denied;
        $data = $this->request->getJSON(true);
        $clean = $this->validatePerson(is_array($data) ? $data : []);
        if (isset($clean['error'])) return $this->error(422, $clean['error']);

        $db = db_connect();
        $personId = (int)$id;
        $db->transBegin();
        try {
            $old = $db->query('SELECT * FROM pessoas WHERE id = ? FOR UPDATE', [$personId])->getRowArray();
            if (!$old) {
                $db->transRollback();
                return $this->error(404, 'Pessoa não encontrada.');
            }
            $old['papeis'] = array_column($db->table('pessoa_papeis')
                ->where('pessoa_id',$personId)->get()->getResultArray(), 'papel');
            $roles = $clean['papeis'];
            unset($clean['papeis']);

            $user = null;
            // Não permitir inativar o administrador logado.
            if ($old['user_id']) {
                $user = auth()->getProvider()->findById($old['user_id']);
                if ($user && $user->inGroup('admin') && $clean['ativo'] === 0) {
                    $db->transRollback();
                    return $this->error(409, 'O administrador não pode ser inativado.');
                }
            }
            $db->table('pessoas')->where('id',$personId)
                ->update([...$clean, 'atualizado_em'=>date('Y-m-d H:i:s')]);
            $this->saveRoles($db, $personId, $roles);
            if ($user && $clean['ativo'] === 0) {
                auth()->getProvider()->deactivate($user);
            }
            $this->audit($db,$personId,'EDITAR',$old,[...$clean,'papeis'=>$roles]);
            $this->commit($db);
            return $this->ok('Pessoa atualizada. Se inativada, o acesso vinculado também foi desativado.');
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    private function validatePerson(array $data): array
    {
        $name = trim(preg_replace('/\s+/u',' ', (string)($data['nome'] ?? '')) ?? '');
        $email = trim((string)($data['email'] ?? ''));
        $phone = trim((string)($data['telefone'] ?? ''));
        $note = trim((string)($data['observacoes'] ?? ''));
        $roles = $data['papeis'] ?? null;
        if ($name === '' || mb_strlen($name)>160) return ['error'=>'Informe o nome (até 160 caracteres).'];
        if ($email !== '' && (strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL))) {
            return ['error'=>'E-mail inválido.'];
        }
        if (mb_strlen($phone)>25 || mb_strlen($note)>3000) {
            return ['error'=>'Telefone ou observações ultrapassam o limite permitido.'];
        }
        if (!is_array($roles) || count($roles)<1 || count($roles)>3
            || count($roles)!==count(array_unique($roles))
            || array_diff($roles, ['corretor','vendedor','gerente'])!==[]) {
            return ['error'=>'Marque pelo menos um papel válido: corretor, vendedor ou gerente.'];
        }
        if (!array_key_exists('ativo',$data) || !is_bool($data['ativo'])) {
            return ['error'=>'Informe a situação da pessoa.'];
        }
        return [
            'nome'=>$name, 'email'=>$email ?: null,
            'telefone'=>$phone ?: null, 'observacoes'=>$note ?: null,
            'papeis'=>array_values($roles),'ativo'=>$data['ativo'] ? 1 : 0,
        ];
    }

    private function saveRoles($db,int $id,array $roles): void
    {
        $db->table('pessoa_papeis')->where('pessoa_id',$id)->delete();
        foreach ($roles as $role) $db->table('pessoa_papeis')->insert(['pessoa_id'=>$id,'papel'=>$role]);
    }

    private function audit($db,int $id,string $action,?array $before,?array $after): void
    {
        $db->table('pessoa_auditoria')->insert([
            'pessoa_id'=>$id,'usuario_autor_id'=>(int)auth('session')->user()->id,
            'acao'=>$action,
            'dados_antes'=>$before===null ? null : json_encode($before,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'dados_depois'=>$after===null ? null : json_encode($after,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
    }

    private function commit($db): void
    {
        if ($db->transStatus() === false) throw new \RuntimeException('Falha na gravação dos dados.');
        $db->transCommit();
    }

    private function ok(string $message, int $status=200): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,
            'csrf'=>['header'=>config('Security')->headerName,'hash'=>csrf_hash()],
        ])->setHeader('Cache-Control','no-store');
    }

    private function error(int $status,string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,
            'csrf'=>['header'=>config('Security')->headerName,'hash'=>csrf_hash()],
        ]);
    }

    private function unexpected(Throwable $e): ResponseInterface
    {
        log_message('error', 'SPLASH pessoas: {message}', ['message'=>$e->getMessage()]);
        return $this->error(500,'Não foi possível salvar os dados. Verifique o log do backend.');
    }
}
