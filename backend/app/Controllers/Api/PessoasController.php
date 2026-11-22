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
        $responsabilidades=[];
        foreach($db->table('fechamento_responsabilidades')->get()->getResultArray() as $rel)
            $responsabilidades[(int)$rel['corretor_pessoa_id']]=(int)$rel['responsavel_pessoa_id'];
        $gestores=[];
        foreach($db->table('gestor_corretores')->get()->getResultArray() as $rel)
            $gestores[(int)$rel['corretor_pessoa_id']]=(int)$rel['gestor_pessoa_id'];
        $roleMap = [];
        foreach ($rows as $role) $roleMap[(int)$role['pessoa_id']][] = $role['papel'];

        foreach ($pessoas as &$pessoa) {
            $pessoa['id'] = (int) $pessoa['id'];
            $pessoa['user_id'] = $pessoa['user_id'] === null ? null : (int)$pessoa['user_id'];
            $pessoa['ativo'] = (bool)$pessoa['ativo'];
            $pessoa['papeis'] = $roleMap[$pessoa['id']] ?? [];
            $pessoa['responsavel_pessoa_id'] = $responsabilidades[$pessoa['id']]??null;
            $pessoa['gestor_pessoa_id']=$gestores[$pessoa['id']]??null;
            $pessoa['usa_sistema']=(bool)($pessoa['usa_sistema']??false);
            $pessoa['gestor_visao_global']=(bool)($pessoa['gestor_visao_global']??false);
            $pessoa['dono_corrente_padrao_pessoa_id']=isset($pessoa['dono_corrente_padrao_pessoa_id'])
                ?(int)$pessoa['dono_corrente_padrao_pessoa_id']:null;
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
            $boss=$clean['responsavel_pessoa_id'];
            $gestor=$clean['gestor_pessoa_id'];
            unset($clean['papeis'],$clean['responsavel_pessoa_id'],$clean['gestor_pessoa_id']);
            $db->table('pessoas')->insert([...$clean, 'criado_em'=>$now]);
            $id = (int)$db->insertID();
            if ($id < 1) throw new \RuntimeException('Pessoa não inserida.');
            $this->saveRoles($db, $id, $roles);
            $this->saveResponsibility($db,$id,$boss);
            $this->saveManager($db,$id,$gestor);
            $clean['responsavel_pessoa_id']=$boss;
            $clean['gestor_pessoa_id']=$gestor;
            $this->audit($db, $id, 'CRIAR', null, [...$clean,'papeis'=>$roles]);
            $this->commit($db);
            return $this->ok('Pessoa cadastrada.', 201);
        } catch (\DomainException $e) {
            $db->transRollback();
            return $this->error(409,$e->getMessage());
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
            $currentLink=$db->table('fechamento_responsabilidades')
                ->select('responsavel_pessoa_id')->where('corretor_pessoa_id',$personId)->get()->getRowArray();
            $old['responsavel_pessoa_id']=$currentLink?(int)$currentLink['responsavel_pessoa_id']:null;
            $managerLink=$db->table('gestor_corretores')->select('gestor_pessoa_id')
                ->where('corretor_pessoa_id',$personId)->get()->getRowArray();
            $old['gestor_pessoa_id']=$managerLink?(int)$managerLink['gestor_pessoa_id']:null;
            $old['papeis'] = array_column($db->table('pessoa_papeis')
                ->where('pessoa_id',$personId)->get()->getResultArray(), 'papel');
            $roles = $clean['papeis'];
            $boss=$clean['responsavel_pessoa_id'];
            $gestor=$clean['gestor_pessoa_id'];
            unset($clean['papeis'],$clean['responsavel_pessoa_id'],$clean['gestor_pessoa_id']);

            $user = null;
            // Não permitir inativar o administrador logado.
            if ($old['user_id']) {
                $user = auth()->getProvider()->findById($old['user_id']);
                if ($user && ! $user->inGroup('admin')) {
                    foreach ($user->getGroups() as $group) {
                        if (in_array($group, ['corretor','vendedor','gerente','operador'], true)
                            && ! in_array($group, $roles, true)) {
                            $db->transRollback();
                            return $this->error(409, 'O papel vinculado ao acesso precisa permanecer marcado ou ser alterado antes no cadastro de usuários.');
                        }
                    }
                }
                if ($user && $user->inGroup('admin') && $clean['ativo'] === 0) {
                    $db->transRollback();
                    return $this->error(409, 'O administrador não pode ser inativado.');
                }
            }
            $db->table('pessoas')->where('id',$personId)
                ->update([...$clean, 'atualizado_em'=>date('Y-m-d H:i:s')]);
            $this->saveRoles($db, $personId, $roles);
            $this->saveResponsibility($db,$personId,$boss);
            $this->saveManager($db,$personId,$gestor);
            $clean['responsavel_pessoa_id']=$boss;
            $clean['gestor_pessoa_id']=$gestor;
            if ($user && $clean['ativo'] === 0) {
                $user->ban('Pessoa inativada pelo administrador SPLASH.');
            }
            $this->audit($db,$personId,'EDITAR',$old,[...$clean,'papeis'=>$roles]);
            $this->commit($db);
            return $this->ok('Pessoa atualizada. Se inativada, o acesso vinculado também foi desativado.');
        } catch (\DomainException $e) {
            $db->transRollback();
            return $this->error(409,$e->getMessage());
        } catch (Throwable $e) {
            $db->transRollback();
            return $this->unexpected($e);
        }
    }

    private function validatePerson(array $data): array
    {
        $name = trim(preg_replace('/\s+/u',' ', (string)($data['nome'] ?? '')) ?? '');
        $email = trim((string)($data['email'] ?? ''));
        $phone = preg_replace('/\\D+/', '', (string)($data['telefone'] ?? ''));
        $note = trim((string)($data['observacoes'] ?? ''));
        $roles = $data['papeis'] ?? null;
        $rawBoss=$data['responsavel_pessoa_id']??null;
        $boss=$rawBoss===null||$rawBoss===''?null:
            filter_var($rawBoss,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($boss===false)return ['error'=>'Responsável financeiro inválido.'];
        $rawManager=$data['gestor_pessoa_id']??null;
        $manager=$rawManager===null||$rawManager===''?null:
            filter_var($rawManager,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($manager===false)return ['error'=>'Gestor comercial inválido.'];
        $rawOwner=$data['dono_corrente_padrao_pessoa_id']??null;
        $owner=$rawOwner===null||$rawOwner===''?null:
            filter_var($rawOwner,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($owner===false)return ['error'=>'Dono padrão da corrente inválido.'];
        if($owner!==null){
            $db=db_connect();
            if(!$db->table('pessoas')->where('id',(int)$owner)->where('ativo',1)->countAllResults()
                || !$db->table('pessoa_papeis')->where('pessoa_id',(int)$owner)
                    ->where('papel','corretor')->countAllResults()){
                return ['error'=>'O dono padrão da corrente precisa ser um corretor ativo.'];
            }
        }
        if ($name === '' || mb_strlen($name)>160) return ['error'=>'Informe o nome (até 160 caracteres).'];
        if ($email !== '' && (strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL))) {
            return ['error'=>'E-mail inválido.'];
        }
        if (($phone!=='' && !in_array(strlen($phone),[10,11],true)) || mb_strlen($note)>3000) {
            return ['error'=>'Telefone precisa ter DDD e 10 ou 11 dígitos; observações até 3000 caracteres.'];
        }
        if (!is_array($roles) || count($roles)<1 || count($roles)>4
            || count(array_filter($roles,'is_string'))!==count($roles)
            || count($roles)!==count(array_unique($roles))
            || array_diff($roles, ['corretor','vendedor','gerente','operador'])!==[]) {
            return ['error'=>'Marque pelo menos um papel válido: corretor, vendedor, gerente ou operador.'];
        }
        if($manager!==null && !in_array('corretor',$roles,true))
            return ['error'=>'O vínculo com gestor só se aplica a corretores.'];
        if($boss!==null && !in_array('corretor',$roles,true))
            return ['error'=>'A responsabilidade financeira se aplica somente à função Corretor.'];
        if(array_key_exists('gestor_visao_global',$data) && !is_bool($data['gestor_visao_global']))
            return ['error'=>'Permissão de visão geral inválida.'];
        if(!in_array('gerente',$roles,true) && ($data['gestor_visao_global']??false)===true)
            return ['error'=>'Visão geral somente para pessoas com função Gerente.'];
        if (!array_key_exists('usa_sistema',$data) || !is_bool($data['usa_sistema']))
            return ['error'=>'Informe se a pessoa utiliza o sistema.'];
        if (!array_key_exists('ativo',$data) || !is_bool($data['ativo'])) {
            return ['error'=>'Informe a situação da pessoa.'];
        }
        return [
            'nome'=>$name, 'email'=>$email ?: null,
            'telefone'=>$phone ?: null, 'observacoes'=>$note ?: null,
            'papeis'=>array_values($roles),'responsavel_pessoa_id'=>$boss,
            'gestor_pessoa_id'=>$manager,'usa_sistema'=>$data['usa_sistema'] ? 1 : 0,
            'dono_corrente_padrao_pessoa_id'=>$owner===null?null:(int)$owner,
            'gestor_visao_global'=>($data['gestor_visao_global']??false) ? 1 : 0,
            'ativo'=>$data['ativo'] ? 1 : 0,
        ];
    }

    /**
     * Relacionamento financeiro cadastrado na pessoa (sem alterar a titularidade).
     * Impede circularidade, grupos em cascata e mudanças com fechamento aberto.
     */
    private function saveResponsibility($db,int $child,?int $boss):void
    {
        $row=$db->table('fechamento_responsabilidades')
            ->where('corretor_pessoa_id',$child)->get()->getRowArray();
        $previous=$row?(int)$row['responsavel_pessoa_id']:null;
        if($previous===$boss)return;
        if($boss!==null){
            if($boss===$child)throw new \DomainException('Uma pessoa não pode ser responsável por si mesma.');
            $manager=$db->table('pessoas')->where('id',$boss)->where('ativo',1)->get()->getRowArray();
            if(!$manager || !$db->table('pessoa_papeis')->where('pessoa_id',$boss)
                ->where('papel','corretor')->countAllResults())
                throw new \DomainException('O responsável financeiro deve ser um corretor ativo.');
            if($db->table('fechamento_responsabilidades')->where('corretor_pessoa_id',$boss)->countAllResults()
                || $db->table('fechamento_responsabilidades')->where('responsavel_pessoa_id',$child)->countAllResults())
                throw new \DomainException('Não é permitida responsabilidade financeira em cascata.');
        }
        if($db->table('fechamento_periodos p')->join('fechamento_periodo_pessoas fp',
            'fp.fechamento_id=p.id')->where('fp.pessoa_id',$child)
            ->whereIn('p.status',['RECEBIMENTOS','REPASSES'])->countAllResults()
            || ($boss!==null && $db->table('fechamento_periodos')
                ->where('responsavel_pessoa_id',$boss)
                ->whereIn('status',['RECEBIMENTOS','REPASSES'])->countAllResults()))
            throw new \DomainException('Conclua ou cancele o fechamento aberto antes de alterar o responsável.');
        $db->table('fechamento_responsabilidades')->where('corretor_pessoa_id',$child)->delete();
        if($boss!==null)$db->table('fechamento_responsabilidades')->insert([
            'corretor_pessoa_id'=>$child,'responsavel_pessoa_id'=>$boss,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
    }

    /** A relação comercial não altera o responsável financeiro. */
    private function saveManager($db,int $corretor,?int $gestor): void
    {
        $old=$db->table('gestor_corretores')->where('corretor_pessoa_id',$corretor)->get()->getRowArray();
        if(($old?(int)$old['gestor_pessoa_id']:null)===$gestor)return;
        if($gestor!==null){
            if($gestor===$corretor)throw new \DomainException('Uma pessoa não pode ser seu próprio gestor.');
            if(!$db->table('pessoas')->where('id',$gestor)->where('ativo',1)->countAllResults()
                || !$db->table('pessoa_papeis')->where('pessoa_id',$gestor)
                    ->where('papel','gerente')->countAllResults())
                throw new \DomainException('Escolha uma pessoa ativa com função Gerente.');
        }
        $db->table('gestor_corretores')->where('corretor_pessoa_id',$corretor)->delete();
        if($gestor!==null)$db->table('gestor_corretores')->insert([
            'corretor_pessoa_id'=>$corretor,'gestor_pessoa_id'=>$gestor,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
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
