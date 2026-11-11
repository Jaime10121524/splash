<?php
declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

/**
 * Gestor (= grupo gerente): consulta e cadastra vendas operacionais.
 * Não herda autorização administrativa para recebimentos, rateios,
 * comissões de terceiros, estornos, ajustes ou relatórios globais.
 */
final class GestorVendasController extends VendasController
{
    private bool $creatingAsManager = false;

    private function manager(): array|ResponseInterface
    {
        $user = auth('session')->user();
        if (!$user || $user->isBanned()) return $this->errorResponse(401, 'Faça login novamente.');
        if (!$user->inGroup('gerente') || $user->inGroup('admin')) {
            return $this->errorResponse(403, 'Apenas gestores podem utilizar esta consulta.');
        }
        $person = db_connect()->table('pessoas')->select('id')
            ->where('user_id', (int)$user->id)->where('ativo', 1)->get()->getRowArray();
        if (!$person) return $this->errorResponse(403, 'Gestor sem pessoa ativa vinculada.');
        return ['user_id'=>(int)$user->id, 'pessoa_id'=>(int)$person['id']];
    }

    // O parent::create() usa guard(). Qualquer outro método herdado
    // continua exclusivo do administrador, inclusive acesso por rota direta.
    protected function guard(): ?ResponseInterface
    {
        if ($this->creatingAsManager) return null;
        return $this->authorizeAdmin();
    }

    public function opcoes(): ResponseInterface
    {
        $actor = $this->manager();
        if ($actor instanceof ResponseInterface) return $actor;
        $db = db_connect();
        $plans = $db->table('plano_versoes')
            ->select('id,codigo,valor,duracao_meses')
            ->where('ativo', 1)->orderBy('duracao_meses', 'ASC')->get()->getResultArray();
        // Só visitas encerradas como VENDA e ainda sem negociação cadastrada.
        $visits = $db->table('visitas v')
            ->select('v.id,v.cliente_id,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,
                v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,
                c.nome AS cliente_nome,p.nome AS corretor_nome')
            ->join('clientes c', 'c.id=v.cliente_id')
            ->join('pessoas p', 'p.id=v.corretor_pessoa_id', 'left')
            ->join('venda_operacoes o', 'o.visita_id=v.id', 'left')
            ->where('v.status', 'VENDA')->where('o.id', null)
            ->orderBy('v.id', 'DESC')->limit(200)->get()->getResultArray();
        return $this->response->setJSON([
            'planos'=>$plans, 'visitas'=>$visits,
            'gerente_pessoa_id'=>$actor['pessoa_id'],
        ])->setHeader('Cache-Control', 'private, no-store');
    }

    public function index(): ResponseInterface
    {
        $actor = $this->manager();
        if ($actor instanceof ResponseInterface) return $actor;
        $db = db_connect();
        // A gestão vê vendas ligadas ao seu cadastro de gerente ou criadas
        // por seu login. Nunca vê comissões, rateios nem contas alheias.
        $rows = $db->table('venda_operacoes o')
            ->select('o.id,o.numero_titulo,o.sigla_plano,o.data_venda,o.valor_cobrado,
                o.situacao,c.nome AS cliente_nome,p.nome AS corretor_nome')
            ->join('clientes c','c.id=o.cliente_id')
            ->join('pessoas p','p.id=o.corretor_pessoa_id','left')
            ->where('o.situacao','VENDA')
            ->groupStart()->where('o.gerente_pessoa_id',$actor['pessoa_id'])
                ->orWhere('o.criado_por_usuario_id',$actor['user_id'])->groupEnd()
            ->orderBy('o.id','DESC')->limit(150)->get()->getResultArray();
        return $this->response->setJSON(['vendas'=>$rows, 'limite'=>150])
            ->setHeader('Cache-Control', 'private, no-store');
    }

    public function create(): ResponseInterface
    {
        $actor = $this->manager();
        if ($actor instanceof ResponseInterface) return $actor;
        $body = $this->jsonPayload();
        $visitId = $this->optionalId($body['visita_id']??null);
        $managerId = $this->optionalId($body['gerente_pessoa_id']??null);
        $clientId = $this->optionalId($body['cliente_id']??null);
        if (!$visitId || !$managerId || !$clientId || $managerId!==$actor['pessoa_id']) {
            return $this->errorResponse(403, 'Informe atendimento válido e o gestor associado ao seu login.');
        }
        if (($body['situacao']??null)!=='VENDA' || ($body['historica']??false)!==false) {
            return $this->errorResponse(403, 'O gestor só pode cadastrar vendas atuais e confirmadas.');
        }
        $visit = db_connect()->table('visitas')->select('id,cliente_id,status')
            ->where('id',$visitId)->get()->getRowArray();
        if (!$visit || $visit['status']!=='VENDA' || (int)$visit['cliente_id']!==$clientId) {
            return $this->errorResponse(403, 'A venda precisa estar vinculada a um atendimento concluído como Venda.');
        }
        $this->creatingAsManager = true;
        try {
            return parent::create();
        } finally {
            $this->creatingAsManager = false;
        }
    }
}
