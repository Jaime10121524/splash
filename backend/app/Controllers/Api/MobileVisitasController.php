<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\ClienteRules;
use App\Libraries\BonificacaoIndicacao;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\I18n\Time;
use Throwable;

/**
 * Fluxos de visitas do Splash Next com autenticação Shield Bearer.
 * Não reutiliza sessões web nem aceita IDs de usuário enviados pelo app.
 * Os eventos e as transições seguem as regras do módulo web de visitas.
 */
final class MobileVisitasController extends BaseController
{
    private const RESULTS = ['RETORNO', 'SEM_VENDA', 'PENDENCIA', 'VENDA'];

    private function error(int $status, string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['message' => $message])
            ->setHeader('Cache-Control', 'no-store');
    }

    private function ok(string $message, array $extra = [], int $status = 200): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['message' => $message, ...$extra])
            ->setHeader('Cache-Control', 'no-store');
    }

    private function access(): ?ResponseInterface
    {
        $user = auth('tokens')->user();
        if ($user === null || $user->isBanned()) {
            return $this->error(401, 'Sua sessão expirou. Entre novamente.');
        }
        if (! $user->inGroup('admin', 'operador', 'gerente', 'corretor')) {
            return $this->error(403, 'Seu perfil não tem acesso aos atendimentos.');
        }
        if ($this->scope($user) === 0) {
            return $this->error(403, 'Conta sem pessoa ativa vinculada.');
        }
        return null;
    }

    private function scope($user): ?int
    {
        if (! $user->inGroup('corretor') || $user->inGroup('admin', 'gerente', 'operador')) {
            return null;
        }
        $person = db_connect()->table('pessoas')->select('id')
            ->where('user_id', (int) $user->id)->where('ativo', 1)->get()->getRowArray();
        return $person ? (int) $person['id'] : 0;
    }

    private function allowed(array $visit, $user): bool
    {
        $scope = $this->scope($user);
        return $scope === null || ($scope > 0 && (
            (int) ($visit['corretor_pessoa_id'] ?? 0) === $scope
            || (int) ($visit['segundo_corretor_pessoa_id'] ?? 0) === $scope
            || (int) ($visit['criado_por_usuario_id'] ?? 0) === (int) $user->id
        ));
    }

    private function now(): string
    {
        return Time::now(config('App')->appTimezone)->toDateTimeString();
    }

    private function event($db, int $visitId, ?string $previous, string $next, int $userId, string $time): void
    {
        $db->table('visita_status_historico')->insert([
            'visita_id' => $visitId,
            'status_anterior' => $previous,
            'status_novo' => $next,
            'usuario_id' => $userId,
            'criado_em' => $time,
        ]);
    }

    private function notice(int $visitId, string $action): void
    {
        try {
            \App\Libraries\VisitasAvisos::registrar($visitId, $action);
        } catch (Throwable $e) {
            // Um aviso não deve reverter uma operação já confirmada no banco.
            log_message('error', 'Splash mobile: falha ao notificar visita {id}: {error}', [
                'id' => $visitId, 'error' => $e->getMessage(),
            ]);
        }
    }

    private function fail(Throwable $e, string $operation, $db): ResponseInterface
    {
        $db->transRollback();
        log_message('error', 'Splash mobile visitas {operation}: {error}', [
            'operation' => $operation, 'error' => $e->getMessage(),
        ]);
        return $this->error(500, 'O servidor não conseguiu concluir a operação. Verifique o log do backend.');
    }

    private function validId($id): ?int
    {
        if (! is_int($id) && ! is_string($id)) return null;
        $value = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        return $value === false ? null : (int) $value;
    }

    private function dateValid(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) return false;
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date && $date->format('Y-m-d') === $value && (int) $date->format('Y') >= 1900;
    }

    private function personWithRole($db, int $personId, array $roles): bool
    {
        return $db->table('pessoas p')
            ->join('pessoa_papeis pp', 'pp.pessoa_id=p.id')
            ->where('p.id', $personId)->where('p.ativo', 1)
            ->whereIn('pp.papel', $roles)->countAllResults() > 0;
    }

    private function brokers($db, array $data, $user): array
    {
        $main = $this->validId($data['corretor_pessoa_id'] ?? null);
        $second = ($data['segundo_corretor_pessoa_id'] ?? null) === null
            || ($data['segundo_corretor_pessoa_id'] ?? '') === ''
            ? null : $this->validId($data['segundo_corretor_pessoa_id']);

        if ($main === null || ($data['segundo_corretor_pessoa_id'] ?? null) !== null
            && ($data['segundo_corretor_pessoa_id'] ?? '') !== '' && $second === null
            || $second !== null && $second === $main) {
            return ['error' => 'Informe o corretor responsável e, se houver, outro corretor diferente.'];
        }
        if (! $this->personWithRole($db, $main, ['corretor'])
            || ($second !== null && ! $this->personWithRole($db, $second, ['corretor']))) {
            return ['error' => 'Escolha corretores ativos com a função Corretor.'];
        }
        $scope = $this->scope($user);
        if ($scope !== null && $scope !== $main && $scope !== $second) {
            return ['error' => 'Você só pode registrar uma visita em que participa.'];
        }
        return ['corretor_pessoa_id' => $main, 'segundo_corretor_pessoa_id' => $second];
    }

    private function updateBrokers($db, array $visit, array $brokers, int $userId, string $now): void
    {
        $before = (int) ($visit['corretor_pessoa_id'] ?? 0);
        $beforeSecond = (int) ($visit['segundo_corretor_pessoa_id'] ?? 0);
        $after = (int) $brokers['corretor_pessoa_id'];
        $afterSecond = (int) ($brokers['segundo_corretor_pessoa_id'] ?? 0);
        if ($before === $after && $beforeSecond === $afterSecond) return;

        $db->table('visitas')->where('id', (int) $visit['id'])
            ->update([...$brokers, 'atualizado_em' => $now]);
        $db->table('visita_corretor_historico')->insert([
            'visita_id' => (int) $visit['id'],
            'anterior_corretor_id' => $before ?: null,
            'novo_corretor_id' => $after,
            'anterior_segundo_id' => $beforeSecond ?: null,
            'novo_segundo_id' => $afterSecond ?: null,
            'usuario_id' => $userId,
            'criado_em' => $now,
        ]);
    }

    public function options(): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $db = db_connect();
        $user = auth('tokens')->user();
        $people = $db->table('pessoas p')
            ->select('p.id, p.nome, pp.papel')
            ->join('pessoa_papeis pp', 'pp.pessoa_id=p.id')
            ->where('p.ativo', 1)->whereIn('pp.papel', ['corretor', 'vendedor'])
            ->orderBy('p.nome', 'ASC')->get()->getResultArray();
        $brokers = [];
        $attendants = [];
        foreach ($people as $row) {
            $id = (int) $row['id'];
            $person = ['id' => $id, 'nome' => (string) $row['nome']];
            $attendants[$id] = $person;
            if ($row['papel'] === 'corretor') $brokers[$id] = $person;
        }
        $reasons = $db->table('motivos_nao_venda')
            ->select('id,descricao')->where('ativo', 1)->orderBy('descricao', 'ASC')
            ->get()->getResultArray();
        foreach ($reasons as &$reason) $reason['id'] = (int) $reason['id'];
        unset($reason);

        $origins = $db->table('lead_origens')
            ->select('id,nome,permite_indicador')
            ->where('ativo', 1)->orderBy('nome', 'ASC')
            ->get()->getResultArray();
        foreach ($origins as &$origin) {
            $origin['id'] = (int) $origin['id'];
            $origin['permite_indicador'] = (bool) $origin['permite_indicador'];
        }
        unset($origin);

        return $this->response->setJSON([
            'corretores' => array_values($brokers),
            'atendentes' => array_values($attendants),
            'motivos' => $reasons,
            'origens' => $origins,
            'minha_pessoa_id' => $this->scope($user),
        ])->setHeader('Cache-Control', 'no-store');
    }

    public function clients(): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $query = trim((string) ($this->request->getGet('q') ?? ''));
        if (mb_strlen($query) < 2 || mb_strlen($query) > 100) {
            return $this->error(422, 'Digite pelo menos duas letras para localizar um cliente.');
        }
        $db = db_connect();
        $builder = $db->table('clientes c')
            ->select('c.id,c.nome,c.telefone')->where('c.ativo', 1);
        $scope = $this->scope(auth('tokens')->user());
        if ($scope !== null) $builder->where('c.dono_corrente_pessoa_id', $scope);
        $digits = preg_replace('/\D/', '', $query);
        $builder->groupStart()->like('c.nome', $query);
        if (strlen($digits) >= 3) $builder->orLike('c.telefone', $digits);
        $builder->groupEnd();
        $rows = $builder->orderBy('c.nome', 'ASC')->limit(25)->get()->getResultArray();
        foreach ($rows as &$row) $row['id'] = (int) $row['id'];
        unset($row);
        return $this->response->setJSON(['clientes' => $rows])
            ->setHeader('Cache-Control', 'no-store');
    }


    /**
     * A chegada consulta isto antes de salvar: se houve encerramento hoje,
     * a escolha de atendente acontece ANTES de alterar a visita.
     */
    public function resumableClientVisit(): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $clientId = $this->validId($this->request->getGet('cliente_id'));
        if ($clientId === null) return $this->error(422, 'Cliente inválido.');

        $db = db_connect();
        $user = auth('tokens')->user();
        $client = $db->table('clientes')->select('id,dono_corrente_pessoa_id,ativo')
            ->where('id', $clientId)->get()->getRowArray();
        $scope = $this->scope($user);
        if (! $client || ! (bool) $client['ativo']
            || ($scope !== null && (int) $client['dono_corrente_pessoa_id'] !== $scope)) {
            return $this->error(404, 'Cliente não encontrado.');
        }

        $day = substr($this->now(), 0, 10);
        $visit = $db->table('visitas v')
            ->select('v.id,v.status,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,
                v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,v.criado_por_usuario_id,
                p.nome AS atendente_nome')
            ->join('pessoas p', 'p.id=v.atendente_pessoa_id', 'left')
            ->where('v.cliente_id', $clientId)
            ->where('v.chegada_em >=', $day . ' 00:00:00')
            ->where('v.chegada_em <=', $day . ' 23:59:59')
            ->orderBy('v.id', 'DESC')->get(1)->getRowArray();

        if (! $visit || ! in_array($visit['status'], ['RETORNO', 'SEM_VENDA', 'PENDENCIA'], true)
            || $db->table('venda_operacoes')->where('visita_id', (int) $visit['id'])->countAllResults()) {
            return $this->response->setJSON(['retomavel' => false])
                ->setHeader('Cache-Control', 'no-store');
        }
        if (! $this->allowed($visit, $user)) return $this->error(403, 'Visita de outro corretor.');

        return $this->response->setJSON([
            'retomavel' => true,
            'visita_id' => (int) $visit['id'],
            'atendente_pessoa_id' => $visit['atendente_pessoa_id'] === null ? null : (int) $visit['atendente_pessoa_id'],
            'atendente_nome' => $visit['atendente_nome'],
        ])->setHeader('Cache-Control', 'no-store');
    }

    /**
     * Carteira de pendencias de TODOS os dias, inclusive sem operacao criada.
     * O gerente enxerga o atendimento, mas so abre dados de negociacoes
     * pertencentes a propria gestao; o operador apenas consulta.
     */
    public function pendencias(): ResponseInterface
    {
        if ($denied=$this->access()) return $denied;
        $user=auth('tokens')->user();
        $db=db_connect();
        $scope=$this->scope($user);
        $admin=$user->inGroup('admin');
        $manager=$user->inGroup('gerente');
        $operator=$user->inGroup('operador') && !$admin && !$manager;
        $personId=null;
        if($manager&&!$admin){
            $person=$db->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            $personId=(int)($person['id']??0);
        }
        $query=$db->table('visitas v')
            ->select('v.id,v.cliente_id,v.chegada_em,v.fim_em,v.retorno_previsto,v.observacoes,
                c.nome AS cliente_nome,c.telefone AS cliente_telefone,
                cp.nome AS corretor_nome,op.id AS operacao_id,
                op.situacao AS operacao_situacao,op.gerente_pessoa_id AS operacao_gerente_id,
                op.criado_por_usuario_id AS operacao_criado_por')
            ->join('clientes c','c.id=v.cliente_id')
            ->join('pessoas cp','cp.id=v.corretor_pessoa_id','left')
            ->join('venda_operacoes op','op.visita_id=v.id','left')
            ->where('v.status','PENDENCIA');
        if($scope!==null){
            $query->groupStart()->where('v.corretor_pessoa_id',$scope)
                ->orWhere('v.segundo_corretor_pessoa_id',$scope)
                ->orWhere('v.criado_por_usuario_id',(int)$user->id)->groupEnd();
        }
        $rows=$query->orderBy('v.id','DESC')->limit(151)->get()->getResultArray();
        $limited=count($rows)>150;
        if($limited)$rows=array_slice($rows,0,150);
        $items=[];
        foreach($rows as $r){
            $operation=(int)($r['operacao_id']??0);
            $canManage=!$operator && ($admin || $manager && (
                (int)($r['operacao_gerente_id']??0)===$personId ||
                (int)($r['operacao_criado_por']??0)===(int)$user->id ||
                $operation===0
            ) || (!$manager && $scope!==0));
            $items[]=[
                'id'=>(int)$r['id'],'cliente_nome'=>$r['cliente_nome'],
                'cliente_telefone'=>$r['cliente_telefone'],
                'corretor_nome'=>$r['corretor_nome'],
                'chegada_em'=>$r['chegada_em'],'fim_em'=>$r['fim_em'],
                'retorno_previsto'=>$r['retorno_previsto'],
                'observacoes'=>$r['observacoes'],
                'possui_negociacao'=>$operation>0,
                'operacao_id'=>$operation>0&&$canManage?$operation:null,
                'pode_gerenciar'=>(bool)$canManage,
            ];
        }
        return $this->response->setJSON(['pendencias'=>$items,'limitado'=>$limited])
            ->setHeader('Cache-Control','private, no-store');
    }

    public function show(int|string $id): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $visitId = $this->validId($id);
        if ($visitId === null) return $this->error(404, 'Atendimento não encontrado.');
        $db = db_connect();
        $visit = $db->table('visitas v')
            ->select('v.id,v.cliente_id,v.status,v.chegada_em,v.inicio_em,v.fim_em,v.retorno_previsto,
                v.observacoes,v.motivo_nao_venda_id,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,
                v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,v.criado_por_usuario_id,
                c.nome AS cliente_nome,c.telefone AS cliente_telefone,
                c.cpf AS cliente_cpf,c.email AS cliente_email,c.data_nascimento AS cliente_nascimento,
                p.nome AS atendente_nome,a.nome AS adicional_nome,cp.nome AS corretor_nome,
                sp.nome AS segundo_corretor_nome,m.descricao AS motivo_nome,
                op.situacao AS operacao_situacao,op.id AS operacao_id')
            ->join('clientes c', 'c.id=v.cliente_id')
            ->join('pessoas p', 'p.id=v.atendente_pessoa_id', 'left')
            ->join('pessoas a', 'a.id=v.atendente_adicional_pessoa_id', 'left')
            ->join('pessoas cp', 'cp.id=v.corretor_pessoa_id', 'left')
            ->join('pessoas sp', 'sp.id=v.segundo_corretor_pessoa_id', 'left')
            ->join('motivos_nao_venda m', 'm.id=v.motivo_nao_venda_id', 'left')
            ->join('venda_operacoes op', 'op.visita_id=v.id', 'left')
            ->where('v.id', $visitId)->get()->getRowArray();

        if (! $visit || ! $this->allowed($visit, auth('tokens')->user())) {
            return $this->error(404, 'Atendimento não encontrado.');
        }
        foreach (['id', 'cliente_id', 'corretor_pessoa_id', 'segundo_corretor_pessoa_id',
            'atendente_pessoa_id', 'atendente_adicional_pessoa_id', 'motivo_nao_venda_id'] as $key) {
            $visit[$key] = $visit[$key] === null ? null : (int) $visit[$key];
        }
        $events = $db->table('visita_status_historico')
            ->select('status_anterior,status_novo,criado_em')
            ->where('visita_id', $visitId)->orderBy('id', 'ASC')->limit(70)->get()->getResultArray();
        // A tabela de auditoria de troca é de uma versão anterior do protótipo.
        // Quem ainda não executou a migração consegue consultar as visitas normalmente.
        $changes = [];
        if ($db->tableExists('visita_atendente_trocas')) {
            $changes = $db->table('visita_atendente_trocas t')
                ->select('t.criado_em,t.atendente_anterior_pessoa_id,t.atendente_novo_pessoa_id,
                    p.nome AS anterior_nome,n.nome AS novo_nome')
                ->join('pessoas p', 'p.id=t.atendente_anterior_pessoa_id', 'left')
                ->join('pessoas n', 'n.id=t.atendente_novo_pessoa_id', 'left')
                ->where('t.visita_id', $visitId)->orderBy('t.id', 'ASC')->limit(70)
                ->get()->getResultArray();
        }
        return $this->response->setJSON(['visita' => $visit, 'historico' => $events, 'trocas_atendente' => $changes])
            ->setHeader('Cache-Control', 'no-store');
    }

    public function arrival(): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $user = auth('tokens')->user();
        $input = $this->request->getJSON(true);
        if (! is_array($input)) return $this->error(422, 'Informe os dados da chegada.');
        $clientId = $this->validId($input['cliente_id'] ?? null);
        $newClient = $input['novo_cliente'] ?? null;
        if (($clientId === null && ! is_array($newClient))
            || ($clientId !== null && array_key_exists('novo_cliente', $input))) {
            return $this->error(422, 'Escolha um cliente existente ou preencha os dados do novo cliente.');
        }
        $db = db_connect();
        $brokers = $this->brokers($db, $input, $user);
        if (isset($brokers['error'])) return $this->error(422, $brokers['error']);

        $db->transBegin();
        try {
            $scope = $this->scope($user);
            if (is_array($newClient)) {
                // Mesmo validador e regras de corrente utilizados pelo cadastro web.
                // Nunca confiar em um usuário, status ou dono de corrente enviado pelo celular
                // quando a conta está limitada a uma corrente.
                $ownerId = $scope !== null
                    ? $scope
                    : ($this->validId($newClient['dono_corrente_pessoa_id'] ?? null)
                        ?? (int) $brokers['corretor_pessoa_id']);
                $newClient['dono_corrente_pessoa_id'] = $ownerId;
                $clean = ClienteRules::validate($db, [...$newClient, 'ativo' => true]);
                if (isset($clean['error'])) {
                    $db->transRollback();
                    return $this->error(422, $clean['error']);
                }
                if ($scope !== null && (int) $clean['dono_corrente_pessoa_id'] !== $scope) {
                    $db->transRollback();
                    return $this->error(403, 'Cliente indicado pertence a outra corrente.');
                }
                $createdAt = $this->now();
                $db->table('clientes')->insert([
                    ...$clean, 'criado_por_usuario_id' => (int) $user->id,
                    'criado_em' => $createdAt,
                ]);
                $clientId = (int) $db->insertID();
                if ($clientId < 1) throw new \RuntimeException('Falha ao cadastrar cliente.');
                $db->table('cliente_corrente_historico')->insert([
                    'cliente_id' => $clientId,
                    'dono_anterior_pessoa_id' => null,
                    'dono_novo_pessoa_id' => (int) $clean['dono_corrente_pessoa_id'],
                    'origem' => $clean['indicador_cliente_id'] ? 'INDICACAO' : 'CADASTRO',
                    'usuario_id' => (int) $user->id,
                    'criado_em' => $createdAt,
                ]);
                $bonificacao = BonificacaoIndicacao::registrar($db, $clientId, $clean, $newClient, $user);
                if (isset($bonificacao['error'])) {
                    $db->transRollback();
                    return $this->error(422, $bonificacao['error']);
                }
            } else {
                $client = $db->query('SELECT id,dono_corrente_pessoa_id,ativo FROM clientes WHERE id=? FOR UPDATE', [$clientId])->getRowArray();
                if (! $client || !(bool) $client['ativo']) {
                    $db->transRollback();
                    return $this->error(422, 'O cliente deve estar ativo.');
                }
                if ($scope !== null && (int) $client['dono_corrente_pessoa_id'] !== $scope) {
                    $db->transRollback();
                    return $this->error(403, 'Cliente fora da sua corrente.');
                }
            }
            $busy = $db->table('visitas')->where('cliente_id', $clientId)
                ->whereIn('status', ['AGUARDANDO', 'ATENDENDO'])->countAllResults();
            if ($busy) {
                $db->transRollback();
                return $this->error(409, 'O cliente já está em atendimento.');
            }
            $now = $this->now();
            $sameDay = $db->table('visitas')->where('cliente_id', $clientId)
                ->where('chegada_em >=', substr($now, 0, 10) . ' 00:00:00')
                ->where('chegada_em <=', substr($now, 0, 10) . ' 23:59:59')
                ->orderBy('id', 'DESC')->get(1)->getRowArray();
            if ($sameDay && in_array($sameDay['status'], ['SEM_VENDA', 'RETORNO', 'PENDENCIA'], true)) {
                $db->transRollback();
                return $this->error(409, 'Há uma visita encerrada hoje. Retome-a antes de registrar uma nova chegada.');
            }
            $last = $db->table('visitas')
                ->select('atendente_pessoa_id,atendente_adicional_pessoa_id')
                ->where('cliente_id', $clientId)
                ->where('atendente_pessoa_id IS NOT NULL', null, false)
                ->orderBy('id', 'DESC')->get(1)->getRowArray();
            $db->table('visitas')->insert([
                'cliente_id' => $clientId,
                'corretor_pessoa_id' => $brokers['corretor_pessoa_id'],
                'segundo_corretor_pessoa_id' => $brokers['segundo_corretor_pessoa_id'],
                'atendente_pessoa_id' => $last['atendente_pessoa_id'] ?? null,
                'atendente_adicional_pessoa_id' => $last['atendente_adicional_pessoa_id'] ?? null,
                'status' => 'AGUARDANDO',
                'chegada_em' => $now,
                'criado_por_usuario_id' => (int) $user->id,
            ]);
            $visitId = (int) $db->insertID();
            if ($visitId < 1) throw new \RuntimeException('Falha na inclusão da visita.');
            $this->event($db, $visitId, null, 'AGUARDANDO', (int) $user->id, $now);
            if ($db->transStatus() === false) throw new \RuntimeException('Falha ao registrar visita.');
            $db->transCommit();
            $this->notice($visitId, 'CHEGADA');
            return $this->ok('Chegada registrada. Horário marcado automaticamente.',
                ['visita_id' => $visitId, 'cliente_id' => $clientId, 'cliente_cadastrado' => is_array($newClient)], 201);
        } catch (Throwable $e) {
            return $this->fail($e, 'chegada', $db);
        }
    }

    public function start(int|string $id): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $visitId = $this->validId($id);
        if ($visitId === null) return $this->error(404, 'Atendimento não encontrado.');
        $input = $this->request->getJSON(true);
        if (! is_array($input)) return $this->error(422, 'Informe o atendente.');
        $main = $this->validId($input['atendente_pessoa_id'] ?? null);
        $second = ($input['atendente_adicional_pessoa_id'] ?? null) === null
            || ($input['atendente_adicional_pessoa_id'] ?? '') === '' ? null
            : $this->validId($input['atendente_adicional_pessoa_id']);
        if ($main === null || ($input['atendente_adicional_pessoa_id'] ?? null) !== null
            && ($input['atendente_adicional_pessoa_id'] ?? '') !== '' && $second === null
            || $second !== null && $second === $main) {
            return $this->error(422, 'Escolha um atendente principal e, se desejar, outro diferente.');
        }

        $user = auth('tokens')->user();
        $db = db_connect();
        $db->transBegin();
        try {
            $visit = $db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE', [$visitId])->getRowArray();
            if (! $visit || ! $this->allowed($visit, $user)) {
                $db->transRollback();
                return $this->error(404, 'Atendimento não encontrado.');
            }
            if ($visit['status'] !== 'AGUARDANDO') {
                $db->transRollback();
                return $this->error(409, 'A visita não está aguardando atendimento.');
            }
            $latest = $db->table('visitas')->select('atendente_pessoa_id')
                ->where('cliente_id', (int) $visit['cliente_id'])
                ->where('id !=', $visitId)
                ->where('atendente_pessoa_id IS NOT NULL', null, false)
                ->orderBy('id', 'DESC')->get(1)->getRowArray();
            if (($visit['atendente_pessoa_id'] && (int) $visit['atendente_pessoa_id'] !== $main)
                || ($latest && (int) $latest['atendente_pessoa_id'] !== $main)) {
                $db->transRollback();
                return $this->error(409, 'Nos retornos, o cliente permanece com o mesmo atendente.');
            }
            if (! $this->personWithRole($db, $main, ['vendedor', 'corretor'])
                || ($second !== null && ! $this->personWithRole($db, $second, ['vendedor', 'corretor']))) {
                $db->transRollback();
                return $this->error(422, 'Selecione atendentes ativos com função Vendedor ou Corretor.');
            }
            $now = $this->now();
            $db->table('visitas')->where('id', $visitId)->update([
                'status' => 'ATENDENDO', 'atendente_pessoa_id' => $main,
                'atendente_adicional_pessoa_id' => $second,
                'inicio_em' => $now, 'atualizado_em' => $now,
            ]);
            $db->table('visita_sessoes')->insert([
                'visita_id' => $visitId, 'inicio_em' => $now, 'fim_em' => null,
                'criado_por_usuario_id' => (int) $user->id,
            ]);
            $this->event($db, $visitId, 'AGUARDANDO', 'ATENDENDO', (int) $user->id, $now);
            if ($db->transStatus() === false) throw new \RuntimeException('Falha na gravação do atendimento.');
            $db->transCommit();
            $this->notice($visitId, 'INICIADO');
            return $this->ok('Atendimento iniciado. Horário registrado pelo servidor.');
        } catch (Throwable $e) {
            return $this->fail($e, 'iniciar', $db);
        }
    }

    public function finish(int|string $id): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $visitId = $this->validId($id);
        if ($visitId === null) return $this->error(404, 'Atendimento não encontrado.');
        $data = $this->request->getJSON(true);
        if (! is_array($data)) return $this->error(422, 'Informe o resultado.');
        $status = (string) ($data['status'] ?? '');
        if (! in_array($status, self::RESULTS, true)) {
            return $this->error(422, 'Escolha um resultado válido.');
        }
        $reason = ($data['motivo_nao_venda_id'] ?? null) === null
            || ($data['motivo_nao_venda_id'] ?? '') === '' ? null : $this->validId($data['motivo_nao_venda_id']);
        if ($status === 'SEM_VENDA' && $reason === null) {
            return $this->error(422, 'Selecione o motivo pelo qual não houve venda.');
        }
        $returnDay = (string) ($data['retorno_previsto'] ?? '');
        if ($status === 'RETORNO' && (! $returnDay || ! $this->dateValid($returnDay))) {
            return $this->error(422, 'Informe a data de retorno no formato AAAA-MM-DD.');
        }
        $notes = $data['observacoes'] ?? '';
        if (! is_string($notes) || mb_strlen($notes) > 3000) {
            return $this->error(422, 'Observações inválidas ou muito longas.');
        }
        $notes = trim($notes) ?: null;
        $db = db_connect();
        $user = auth('tokens')->user();
        $db->transBegin();
        try {
            $visit = $db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE', [$visitId])->getRowArray();
            if (! $visit || ! $this->allowed($visit, $user)) {
                $db->transRollback();
                return $this->error(404, 'Atendimento não encontrado.');
            }
            if ($visit['status'] !== 'ATENDENDO') {
                $db->transRollback();
                return $this->error(409, 'Somente um atendimento iniciado pode ser finalizado.');
            }
            if ($reason !== null && $status === 'SEM_VENDA'
                && ! $db->table('motivos_nao_venda')->where('id', $reason)->countAllResults()) {
                $db->transRollback();
                return $this->error(422, 'Motivo não encontrado.');
            }
            $now = $this->now();
            $db->table('visitas')->where('id', $visitId)->update([
                'status' => $status, 'fim_em' => $now,
                'motivo_nao_venda_id' => $status === 'SEM_VENDA' ? $reason : null,
                'retorno_previsto' => $status === 'RETORNO' ? $returnDay : null,
                'observacoes' => $notes, 'atualizado_em' => $now,
            ]);
            $db->table('visita_sessoes')->where('visita_id', $visitId)
                ->where('fim_em IS NULL', null, false)->update(['fim_em' => $now]);
            $db->table('visita_resultados_historico')->insert([
                'visita_id' => $visitId, 'resultado' => $status,
                'motivo_nao_venda_id' => $status === 'SEM_VENDA' ? $reason : null,
                'retorno_previsto' => $status === 'RETORNO' ? $returnDay : null,
                'observacoes' => $notes, 'criado_em' => $now, 'usuario_id' => (int) $user->id,
            ]);
            $this->event($db, $visitId, 'ATENDENDO', $status, (int) $user->id, $now);
            if ($db->transStatus() === false) throw new \RuntimeException('Falha ao encerrar atendimento.');
            $db->transCommit();
            $this->notice($visitId, $status);
            $message = $status === 'VENDA'
                ? 'Venda fechada registrada. O título e o financeiro devem ser lançados no módulo Vendas.'
                : 'Atendimento finalizado com resultado registrado.';
            return $this->ok($message);
        } catch (Throwable $e) {
            return $this->fail($e, 'finalizar', $db);
        }
    }

    public function resume(int|string $id): ResponseInterface
    {
        if ($denied = $this->access()) return $denied;
        $visitId = $this->validId($id);
        if ($visitId === null) return $this->error(404, 'Atendimento não encontrado.');

        $data = $this->request->getJSON(true);
        // A retomada não troca atendente. A identidade vem exclusivamente da visita
        // gravada no banco, nunca de um ID enviado pelo aplicativo.
        if (! is_array($data) || ($data['modo_atendente'] ?? null) !== 'mesmo'
            || array_key_exists('atendente_pessoa_id', $data)
            || array_key_exists('atendente_adicional_pessoa_id', $data)) {
            return $this->error(422, 'A visita somente pode ser retomada com o mesmo atendente.');
        }

        $db = db_connect();
        $user = auth('tokens')->user();
        $db->transBegin();
        try {
            $visit = $db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE', [$visitId])->getRowArray();
            if (! $visit || ! $this->allowed($visit, $user)) {
                $db->transRollback();
                return $this->error(404, 'Atendimento não encontrado.');
            }
            $now = $this->now();
            if (substr((string) $visit['chegada_em'], 0, 10) !== substr($now, 0, 10)
                || ! in_array($visit['status'], ['RETORNO', 'SEM_VENDA', 'PENDENCIA'], true)) {
                $db->transRollback();
                return $this->error(409, 'Somente visitas encerradas hoje podem ser retomadas.');
            }
            if ($db->table('venda_operacoes')->where('visita_id', $visitId)->countAllResults()) {
                $db->transRollback();
                return $this->error(409, 'A visita possui uma venda vinculada.');
            }

            // Se veio da tela de chegada, permite atualizar somente os corretores,
            // mantendo a corrente e o atendente original.
            $inputBrokers = $data['corretor_pessoa_id'] ?? null;
            $brokers = $this->brokers($db, $inputBrokers === null ? [
                'corretor_pessoa_id' => $visit['corretor_pessoa_id'],
                'segundo_corretor_pessoa_id' => $visit['segundo_corretor_pessoa_id'],
            ] : $data, $user);
            if (isset($brokers['error'])) {
                $db->transRollback();
                return $this->error(422, $brokers['error']);
            }

            $other = $db->table('visitas')->where('cliente_id', (int) $visit['cliente_id'])
                ->where('id !=', $visitId)
                ->whereIn('status', ['AGUARDANDO', 'ATENDENDO'])->countAllResults();
            if ($other) {
                $db->transRollback();
                return $this->error(409, 'O cliente já possui outro atendimento em andamento.');
            }
            if ($db->table('visita_sessoes')->where('visita_id', $visitId)
                ->where('fim_em IS NULL', null, false)->countAllResults()) {
                $db->transRollback();
                return $this->error(409, 'Esta visita já possui uma sessão em andamento.');
            }

            $main = $visit['atendente_pessoa_id'] === null
                ? null : (int) $visit['atendente_pessoa_id'];
            $secondary = $visit['atendente_adicional_pessoa_id'] === null
                ? null : (int) $visit['atendente_adicional_pessoa_id'];
            if ($main === null || $main < 1) {
                $db->transRollback();
                return $this->error(409, 'Esta visita não possui atendente anterior. Regularize o cadastro antes de retomar.');
            }
            if ($main === $secondary
                || ! $this->personWithRole($db, $main, ['vendedor', 'corretor'])
                || ($secondary !== null && ! $this->personWithRole($db, $secondary, ['vendedor', 'corretor']))) {
                $db->transRollback();
                return $this->error(422, 'O atendente anterior precisa estar ativo e ter função Vendedor ou Corretor.');
            }

            $this->updateBrokers($db, $visit, $brokers, (int) $user->id, $now);

            // A retomada e o início da nova sessão ocorrem em UMA transação.
            // Os tempos anteriores permanecem preservados em visita_sessoes.
            $db->table('visitas')->where('id', $visitId)->update([
                'status' => 'ATENDENDO',
                'atendente_pessoa_id' => $main,
                'atendente_adicional_pessoa_id' => $secondary,
                'inicio_em' => $now,
                'fim_em' => null,
                'retorno_previsto' => null,
                'motivo_nao_venda_id' => null,
                'atualizado_em' => $now,
            ]);
            $db->table('visita_sessoes')->insert([
                'visita_id' => $visitId, 'inicio_em' => $now, 'fim_em' => null,
                'criado_por_usuario_id' => (int) $user->id,
            ]);
            $this->event($db, $visitId, (string) $visit['status'], 'AGUARDANDO', (int) $user->id, $now);
            $this->event($db, $visitId, 'AGUARDANDO', 'ATENDENDO', (int) $user->id, $now);
            if ($db->transStatus() === false) throw new \RuntimeException('Falha ao retomar atendimento.');
            $db->transCommit();

            $this->notice($visitId, 'RETOMADA');
            return $this->ok('Visita retomada com o mesmo atendente. O atendimento já está em andamento.');
        } catch (Throwable $e) {
            return $this->fail($e, 'retomar', $db);
        }
    }

}
