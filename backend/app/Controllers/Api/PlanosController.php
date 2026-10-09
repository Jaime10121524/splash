<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Cadastro de planos e versões. Os valores comerciais antigos nunca são editados:
 * reajuste = nova versão. Controle de acesso exclusivamente no servidor.
 */
class PlanosController extends BaseController
{
    private function guard(): ?ResponseInterface
    {
        $user = auth('session')->user();
        if ($user === null) {
            return $this->response->setStatusCode(401)->setJSON([
                'message' => 'Sua sessão expirou. Faça login novamente.',
            ]);
        }

        if (! $user->inGroup('admin') || ! $user->can('settings.manage')) {
            return $this->response->setStatusCode(403)->setJSON([
                'message' => 'Você não tem permissão para gerenciar planos.',
            ]);
        }

        return null;
    }

    public function index(): ResponseInterface
    {
        if ($denied = $this->guard()) {
            return $denied;
        }

        $db = db_connect();
        $planos = $db->table('planos')
            ->orderBy('id', 'DESC')->get()->getResultArray();
        $versoes = $db->table('plano_versoes')
            ->orderBy('plano_id', 'DESC')
            ->orderBy('versao', 'DESC')
            ->get()->getResultArray();

        $porPlano = [];
        foreach ($versoes as $versao) {
            $versao['ativo'] = (bool) $versao['ativo'];
            $porPlano[(int) $versao['plano_id']][] = $versao;
        }
        foreach ($planos as &$plano) {
            $plano['versoes'] = $porPlano[(int) $plano['id']] ?? [];
        }
        unset($plano);

        return $this->response->setJSON(['planos' => $planos])
            ->setHeader('Cache-Control', 'no-store');
    }

    public function create(): ResponseInterface
    {
        if ($denied = $this->guard()) {
            return $denied;
        }

        $data = $this->request->getJSON(true);
        $validated = $this->validateVersion(is_array($data) ? $data : []);
        if (isset($validated['error'])) {
            return $this->failInput($validated['error']);
        }

        $db = db_connect();
        if ($db->table('plano_versoes')->where('codigo', $validated['codigo'])->countAllResults() > 0) {
            return $this->conflict('Já existe uma versão cadastrada com esse código.');
        }

        $db->transBegin();
        try {
            $db->table('planos')->insert(['criado_em' => date('Y-m-d H:i:s')]);
            $id = (int) $db->insertID();
            if (! $id) {
                throw new \RuntimeException('Não foi possível criar o plano.');
            }

            $db->table('plano_versoes')->insert([
                'plano_id' => $id,
                'versao' => 1,
                ...$validated,
                'criado_em' => date('Y-m-d H:i:s'),
            ]);

            if ($db->transStatus() === false) {
                throw new \RuntimeException('Não foi possível concluir o cadastro.');
            }
            $db->transCommit();

            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'Plano cadastrado com sucesso.',
                'plano_id' => $id,
                'csrf' => $this->csrfData(),
            ]);
        } catch (Throwable $e) {
            $db->transRollback();
            log_message('error', 'SPLASH plano create: {message}', ['message' => $e->getMessage()]);
            return $this->response->setStatusCode(500)->setJSON([
                'message' => 'Não foi possível cadastrar o plano. Confira os dados e tente novamente.',
                'csrf' => $this->csrfData(),
            ]);
        }
    }

    public function novaVersao(int|string $planoId): ResponseInterface
    {
        if ($denied = $this->guard()) {
            return $denied;
        }

        $data = $this->request->getJSON(true);
        $validated = $this->validateVersion(is_array($data) ? $data : []);
        if (isset($validated['error'])) {
            return $this->failInput($validated['error']);
        }

        $planoId = (int) $planoId;
        $db = db_connect();
        if ($db->table('planos')->where('id', $planoId)->countAllResults() === 0) {
            return $this->response->setStatusCode(404)->setJSON(['message' => 'Plano não encontrado.']);
        }
        if ($db->table('plano_versoes')->where('codigo', $validated['codigo'])->countAllResults() > 0) {
            return $this->conflict('Este código já pertence a outra versão de plano.');
        }

        $db->transBegin();
        try {
            // Bloqueia a família para serializar revisões concorrentes.
            $db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$planoId]);
            $ultima = $db->table('plano_versoes')
                ->selectMax('versao')->where('plano_id', $planoId)->get()->getRowArray();
            $numero = ((int) ($ultima['versao'] ?? 0)) + 1;

            if ($validated['ativo'] === 1) {
                $db->table('plano_versoes')->where('plano_id', $planoId)
                    ->update(['ativo' => 0]);
            }
            $db->table('plano_versoes')->insert([
                'plano_id' => $planoId,
                'versao' => $numero,
                ...$validated,
                'criado_em' => date('Y-m-d H:i:s'),
            ]);

            if ($db->transStatus() === false) {
                throw new \RuntimeException('Falha ao inserir nova versão.');
            }
            $db->transCommit();

            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'Nova versão cadastrada. O histórico foi preservado.',
                'plano_id' => $planoId,
                'csrf' => $this->csrfData(),
            ]);
        } catch (Throwable $e) {
            $db->transRollback();
            log_message('error', 'SPLASH plano versao: {message}', ['message' => $e->getMessage()]);
            return $this->response->setStatusCode(500)->setJSON([
                'message' => 'Não foi possível salvar a versão. Verifique se o código já está em uso.',
                'csrf' => $this->csrfData(),
            ]);
        }
    }

    public function status(int|string $planoId, int|string $versaoId): ResponseInterface
    {
        if ($denied = $this->guard()) {
            return $denied;
        }

        $data = $this->request->getJSON(true);
        if (! is_array($data) || ! array_key_exists('ativo', $data) || ! is_bool($data['ativo'])) {
            return $this->failInput('Informe a situação ativa ou inativa.');
        }

        $planoId = (int) $planoId;
        $versaoId = (int) $versaoId;
        $db = db_connect();
        $db->transBegin();
        try {
            $parent = $db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$planoId])->getRowArray();
            $version = $db->table('plano_versoes')
                ->where('plano_id', $planoId)->where('id', $versaoId)->get()->getRowArray();

            if (! $parent || ! $version) {
                $db->transRollback();
                return $this->response->setStatusCode(404)->setJSON([
                    'message' => 'Versão do plano não encontrada.',
                ]);
            }

            if ($data['ativo']) {
                $db->table('plano_versoes')->where('plano_id', $planoId)->update(['ativo' => 0]);
            }
            $db->table('plano_versoes')->where('id', $versaoId)
                ->update(['ativo' => $data['ativo'] ? 1 : 0]);

            if ($db->transStatus() === false) {
                throw new \RuntimeException('Falha ao alterar situação.');
            }
            $db->transCommit();

            return $this->response->setJSON([
                'message' => $data['ativo'] ? 'Versão ativada.' : 'Versão inativada.',
                'csrf' => $this->csrfData(),
            ]);
        } catch (Throwable $e) {
            $db->transRollback();
            log_message('error', 'SPLASH plano status: {message}', ['message' => $e->getMessage()]);
            return $this->response->setStatusCode(500)->setJSON([
                'message' => 'Não foi possível alterar a situação.',
                'csrf' => $this->csrfData(),
            ]);
        }
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function validateVersion(array $data): array
    {
        $codigo = trim(preg_replace('/\s+/u', ' ', (string) ($data['codigo'] ?? '')) ?? '');
        $valor = $data['valor'] ?? '';
        $duracao = filter_var($data['duracao_meses'] ?? null, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 2400],
        ]);

        if ($codigo === '' || mb_strlen($codigo) > 40 || ! preg_match('/^[\pL\pN\s\/._-]+$/u', $codigo)) {
            return ['error' => 'Informe um código de até 40 caracteres (letras, números, espaço, barra, ponto ou hífen).'];
        }
        if (! is_string($valor) && ! is_numeric($valor)) {
            return ['error' => 'Informe um valor válido.'];
        }
        $valor = (string) $valor;
        if (! preg_match('/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/D', $valor) || (float) $valor <= 0) {
            return ['error' => 'Informe um valor positivo com até duas casas decimais.'];
        }
        if ($duracao === false) {
            return ['error' => 'Informe a duração do plano em meses (1 a 2400).'];
        }
        if (! array_key_exists('ativo', $data) || ! is_bool($data['ativo'])) {
            return ['error' => 'Informe se a versão está ativa ou inativa.'];
        }

        $vigencia = $data['vigencia_inicio'] ?? null;
        if ($vigencia === '') {
            $vigencia = null;
        }
        if ($vigencia !== null) {
            if (! is_string($vigencia)) {
                return ['error' => 'Data de vigência inválida.'];
            }
            $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $vigencia);
            if (! $dt || $dt->format('Y-m-d') !== $vigencia) {
                return ['error' => 'Data de vigência inválida.'];
            }
        }

        $partes = explode('.', $valor, 2);
        $valorDecimal = $partes[0] . '.' . str_pad($partes[1] ?? '', 2, '0');

        return [
            'codigo' => $codigo,
            'valor' => $valorDecimal,
            'duracao_meses' => $duracao,
            'ativo' => $data['ativo'] ? 1 : 0,
            'vigencia_inicio' => $vigencia,
        ];
    }

    private function csrfData(): array
    {
        return [
            'header' => config('Security')->headerName,
            'hash' => csrf_hash(),
        ];
    }

    private function failInput(string $message): ResponseInterface
    {
        return $this->response->setStatusCode(422)->setJSON([
            'message' => $message, 'csrf' => $this->csrfData(),
        ]);
    }

    private function conflict(string $message): ResponseInterface
    {
        return $this->response->setStatusCode(409)->setJSON([
            'message' => $message, 'csrf' => $this->csrfData(),
        ]);
    }
}
