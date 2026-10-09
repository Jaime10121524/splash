<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Planos: sigla (P/T) não é número de título. Cada reajuste cria uma versão.
 * Alterações são correções auditadas e nunca são permitidas se a versão
 * estiver referenciada em vendas. A numeração individual será gerada na venda.
 */
class PlanosController extends BaseController
{
    private function guard(): ?ResponseInterface
    {
        $user = auth('session')->user();
        if ($user === null) {
            return $this->respondError(401, 'Sua sessão expirou. Faça login novamente.');
        }
        if (! $user->inGroup('admin') || ! $user->can('settings.manage')) {
            return $this->respondError(403, 'Você não tem permissão para gerenciar planos.');
        }
        return null;
    }

    public function index(): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;

        $db = db_connect();
        $plans = $db->table('planos')->orderBy('id', 'DESC')->get()->getResultArray();
        $versions = $db->table('plano_versoes')->orderBy('plano_id','DESC')
            ->orderBy('versao','DESC')->get()->getResultArray();

        $grouped = [];
        foreach ($versions as $version) {
            $version['ativo'] = (bool) $version['ativo'];
            $grouped[(int) $version['plano_id']][] = $version;
        }
        foreach ($plans as &$plan) $plan['versoes'] = $grouped[(int) $plan['id']] ?? [];
        unset($plan);

        return $this->response->setJSON(['planos' => $plans])->setHeader('Cache-Control', 'no-store');
    }

    public function create(): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;
        $payload = $this->request->getJSON(true);
        $valid = $this->validateVersion(is_array($payload) ? $payload : []);
        if (isset($valid['error'])) return $this->respondError(422, $valid['error']);

        $db = db_connect();
        $db->transBegin();
        try {
            $now = date('Y-m-d H:i:s');
            $db->table('planos')->insert(['criado_em' => $now]);
            $id = (int) $db->insertID();
            if ($id < 1) throw new \RuntimeException('Falha ao criar plano.');
            $db->table('plano_versoes')->insert(['plano_id'=>$id, 'versao'=>1, ...$valid, 'criado_em'=>$now]);
            $versaoId = (int) $db->insertID();
            $this->audit($db, $id, $versaoId, 'CRIAR', null, $valid);
            $this->commit($db);
            return $this->respondOK('Plano cadastrado.', 201);
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    public function novaVersao(int|string $planoId): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;
        $payload = $this->request->getJSON(true);
        $valid = $this->validateVersion(is_array($payload) ? $payload : []);
        if (isset($valid['error'])) return $this->respondError(422, $valid['error']);

        $id = (int) $planoId;
        $db = db_connect();
        $db->transBegin();
        try {
            $plan = $db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$id])->getRowArray();
            if (! $plan) {
                $db->transRollback();
                return $this->respondError(404, 'Plano não encontrado.');
            }
            $max = $db->table('plano_versoes')->selectMax('versao')
                ->where('plano_id', $id)->get()->getRowArray();
            $num = (int) ($max['versao'] ?? 0) + 1;
            if ($valid['ativo'] === 1) {
                $db->table('plano_versoes')->where('plano_id', $id)->update(['ativo' => 0]);
            }
            $now = date('Y-m-d H:i:s');
            $db->table('plano_versoes')->insert([
                'plano_id'=>$id, 'versao'=>$num, ...$valid, 'criado_em'=>$now,
            ]);
            $versionId = (int) $db->insertID();
            $this->audit($db, $id, $versionId, 'REAJUSTE', null, $valid);
            $this->commit($db);
            return $this->respondOK('Nova versão criada; o histórico foi mantido.', 201);
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    public function atualizar(int|string $planoId, int|string $versaoId): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;
        $payload = $this->request->getJSON(true);
        $valid = $this->validateVersion(is_array($payload) ? $payload : []);
        if (isset($valid['error'])) return $this->respondError(422, $valid['error']);

        $id = (int) $planoId;
        $versionId = (int) $versaoId;
        $db = db_connect();
        $db->transBegin();
        try {
            $plan = $db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$id])->getRowArray();
            $before = $db->table('plano_versoes')->where('plano_id',$id)
                ->where('id',$versionId)->get()->getRowArray();
            if (! $plan || ! $before) {
                $db->transRollback();
                return $this->respondError(404, 'Versão não encontrada.');
            }
            if ($this->hasSales($db, $versionId)) {
                $db->transRollback();
                return $this->respondError(409, 'Esta versão já está vinculada a vendas. Para alterar as condições, crie um reajuste.');
            }
            // Edição é correção do cadastro, não reajuste. Registra o antes/depois.
            if ($valid['ativo'] === 1) {
                $db->table('plano_versoes')->where('plano_id', $id)->update(['ativo'=>0]);
            }
            $db->table('plano_versoes')->where('id',$versionId)->update($valid);
            $this->audit($db, $id, $versionId, 'EDITAR', $before, $valid);
            $this->commit($db);
            return $this->respondOK('Dados da versão atualizados.');
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    public function status(int|string $planoId, int|string $versaoId): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;
        $payload = $this->request->getJSON(true);
        if (!is_array($payload) || !isset($payload['ativo']) || !is_bool($payload['ativo'])) {
            return $this->respondError(422, 'Informe a situação da versão.');
        }

        $id=(int) $planoId;
        $vid=(int) $versaoId;
        $db=db_connect();
        $db->transBegin();
        try {
            $plan=$db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$id])->getRowArray();
            $before=$db->table('plano_versoes')->where('plano_id',$id)
                ->where('id',$vid)->get()->getRowArray();
            if (!$plan || !$before) {
                $db->transRollback();
                return $this->respondError(404, 'Versão não encontrada.');
            }
            if ($payload['ativo']) {
                $db->table('plano_versoes')->where('plano_id', $id)->update(['ativo'=>0]);
            }
            $db->table('plano_versoes')->where('id',$vid)->update(['ativo'=>$payload['ativo']?1:0]);
            $this->audit($db, $id, $vid, 'STATUS', $before, ['ativo'=>$payload['ativo']]);
            $this->commit($db);
            return $this->respondOK($payload['ativo'] ? 'Plano ativado.' : 'Plano inativado.');
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    public function excluir(int|string $planoId): ResponseInterface
    {
        if ($denied = $this->guard()) return $denied;
        $id=(int) $planoId;
        $db=db_connect();
        $db->transBegin();
        try {
            $plan=$db->query('SELECT id FROM planos WHERE id = ? FOR UPDATE', [$id])->getRowArray();
            if (!$plan) {
                $db->transRollback();
                return $this->respondError(404, 'Plano não encontrado.');
            }
            $versions=$db->table('plano_versoes')->where('plano_id',$id)
                ->orderBy('versao')->get()->getResultArray();
            foreach ($versions as $version) {
                if ($this->hasSales($db, (int) $version['id'])) {
                    $db->transRollback();
                    return $this->respondError(409, 'Há vendas vinculadas a este plano. Inative-o em vez de excluir.');
                }
            }
            $this->audit($db, $id, null, 'EXCLUIR', $versions, null);
            $db->table('plano_versoes')->where('plano_id',$id)->delete();
            $db->table('planos')->where('id',$id)->delete();
            $this->commit($db);
            return $this->respondOK('Plano excluído.');
        } catch (Throwable $e) {
            $db->transRollback();
            log_message('error', 'SPLASH exclusao plano: {msg}', ['msg'=>$e->getMessage()]);
            return $this->respondError(409, 'Não foi possível excluir. Se existir movimentação vinculada, inative o plano.');
        }
    }

    private function hasSales($db, int $versionId): bool
    {
        // Validação preventiva para a implementação futura de vendas.
        // As FKs de vendas/títulos também deverão ser RESTRICT na exclusão.
        return $db->tableExists('vendas')
            && $db->fieldExists('plano_versao_id', 'vendas')
            && $db->table('vendas')->where('plano_versao_id',$versionId)->countAllResults() > 0;
    }

    private function validateVersion(array $data): array
    {
        // Código agora é somente sigla. Números (ex.: 1567) pertencem ao título de cada venda.
        $sigla=mb_strtoupper(trim((string)($data['codigo']??'')));
        $sigla=preg_replace('/\s*\/\s*/u','/',$sigla) ?? '';
        $valor=$data['valor']??'';
        $meses=filter_var($data['duracao_meses']??null,FILTER_VALIDATE_INT,[
            'options'=>['min_range'=>1,'max_range'=>2400],
        ]);
        if (!preg_match('/^\p{L}{1,8}\/\p{L}{1,8}$/uD',$sigla)) {
            return ['error'=>'Informe somente a sigla do plano, como P/T ou R/T. A numeração é por venda.'];
        }
        if (!is_string($valor)&&!is_numeric($valor))return ['error'=>'Valor do plano inválido.'];
        $valor=(string)$valor;
        if (!preg_match('/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/D',$valor)
            || !preg_match('/[1-9]/',str_replace('.','',$valor))) {
            return ['error'=>'Informe valor positivo, com até duas casas decimais.'];
        }
        if ($meses===false)return ['error'=>'Informe prazo em meses, entre 1 e 2400.'];
        if (!isset($data['ativo'])||!is_bool($data['ativo']))return ['error'=>'Informe se o plano está ativo.'];
        $vigencia=$data['vigencia_inicio']??null;
        if ($vigencia==='')$vigencia=null;
        if ($vigencia!==null) {
            if (!is_string($vigencia))return ['error'=>'Data de vigência inválida.'];
            $dt=\DateTimeImmutable::createFromFormat('!Y-m-d',$vigencia);
            if (!$dt||$dt->format('Y-m-d')!==$vigencia)return ['error'=>'Data de vigência inválida.'];
        }
        $parts=explode('.',$valor,2);
        return [
            'codigo'=>$sigla,
            'valor'=>$parts[0].'.'.str_pad($parts[1]??'',2,'0'),
            'duracao_meses'=>$meses,
            'ativo'=>$data['ativo']?1:0,
            'vigencia_inicio'=>$vigencia,
        ];
    }

    private function audit($db,int $planId,?int $versionId,string $action,?array $before,?array $after): void
    {
        $db->table('plano_alteracoes')->insert([
            'plano_id'=>$planId,
            'versao_id'=>$versionId,
            'acao'=>$action,
            'antes'=>$before===null?null:json_encode($before,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'depois'=>$after===null?null:json_encode($after,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'usuario_id'=>(int) auth('session')->user()->id,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
    }

    private function commit($db): void
    {
        if ($db->transStatus() === false) throw new \RuntimeException('Falha ao gravar dados do plano.');
        $db->transCommit();
    }

    private function respondOK(string $message,int $status=200): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,'csrf'=>$this->csrfData(),
        ])->setHeader('Cache-Control','no-store');
    }

    private function respondError(int $status,string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,'csrf'=>$this->csrfData(),
        ]);
    }

    private function csrfData(): array
    {
        return ['header'=>config('Security')->headerName,'hash'=>csrf_hash()];
    }

    private function unexpected(Throwable $e): ResponseInterface
    {
        log_message('error','SPLASH Plano: {msg}',['msg'=>$e->getMessage()]);
        return $this->respondError(500,'Não foi possível salvar o plano. Verifique o log do servidor.');
    }
}
