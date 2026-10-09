<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Gerenciamento administrativo de contas Shield.
 * Não permite criar outro administrador nem alterar/desativar conta admin.
 * Pessoas podem existir sem login, e uma conta só se vincula a uma pessoa.
 */
class UsuariosController extends BaseController
{
    private const GROUPS = ['corretor','vendedor','gerente'];

    private function authorize(): ?ResponseInterface
    {
        $u=auth('session')->user();
        if (!$u) return $this->error(401,'Faça login novamente.');
        if (!$u->inGroup('admin') || !$u->can('users.manage')) {
            return $this->error(403,'Somente o administrador gerencia acessos.');
        }
        return null;
    }

    public function index(): ResponseInterface
    {
        if ($denied=$this->authorize()) return $denied;

        $accounts=auth()->getProvider()->withIdentities()->withGroups()->findAll(500);
        $linked=db_connect()->table('pessoas')->where('user_id IS NOT NULL')
            ->select('id,nome,user_id')->get()->getResultArray();
        $names=[];
        foreach ($linked as $p) $names[(int)$p['user_id']]=[
            'pessoa_id'=>(int)$p['id'],'pessoa_nome'=>$p['nome'],
        ];
        $output=[];
        foreach ($accounts as $u) {
            $id=(int)$u->id;
            $groups=$u->getGroups();
            $output[]=[
                'id'=>$id,'username'=>$u->username,'email'=>$u->email ?? '',
                'groups'=>$groups,'admin'=>$u->inGroup('admin'),
                'ativo'=>!$u->isBanned(),
                'pessoa_id'=>$names[$id]['pessoa_id']??null,
                'pessoa_nome'=>$names[$id]['pessoa_nome']??null,
            ];
        }
        return $this->response->setJSON(['usuarios'=>$output])
            ->setHeader('Cache-Control','no-store');
    }

    public function create(int|string $personId): ResponseInterface
    {
        if ($denied=$this->authorize())return $denied;
        $db=db_connect();
        $id=(int)$personId;
        $data=$this->request->getJSON(true);
        $valid=$this->validateAccount(is_array($data)?$data:[], true);
        if (isset($valid['error']))return $this->error(422,$valid['error']);

        $db->transBegin();
        try {
            $person=$db->query('SELECT * FROM pessoas WHERE id = ? FOR UPDATE',[$id])->getRowArray();
            if(!$person){$db->transRollback();return $this->error(404,'Pessoa não encontrada.');}
            if($person['user_id']){$db->transRollback();return $this->error(409,'Esta pessoa já possui uma conta vinculada.');}
            if(!(bool)$person['ativo']){$db->transRollback();return $this->error(409,'Ative a pessoa antes de criar um acesso.');}
            if(!$this->personHasRole($db,$id,$valid['group'])){
                $db->transRollback();return $this->error(422,'O grupo precisa corresponder a um papel cadastrado na pessoa.');
            }
            $provider=auth()->getProvider();
            if($provider->findByCredentials(['username'=>$valid['username']])
                ||$provider->findByCredentials(['email'=>$valid['email']])){
                $db->transRollback();return $this->error(409,'Nome de usuário ou e-mail já utilizado.');
            }
            $group=$valid['group'];
            $u=$provider->createNewUser([
                'username'=>$valid['username'], 'email'=>$valid['email'],
                'password'=>$valid['password'], 'active'=>true,
            ]);
            $provider->save($u);
            $user=$provider->findById($provider->getInsertID());
            if(!$user)throw new \RuntimeException('Conta Shield não foi criada.');
            $user->syncGroups($group);
            $db->table('pessoas')->where('id',$id)->update([
                'user_id'=>(int)$user->id,
                'atualizado_em'=>date('Y-m-d H:i:s'),
            ]);
            $this->audit($db,$id,'CRIAR_ACESSO',['user_id'=>(int)$user->id,'username'=>$valid['username'],'group'=>$group]);
            $this->commit($db);
            return $this->ok('Acesso criado. A pessoa já pode entrar com usuário e senha.',201);
        } catch(Throwable $e){$db->transRollback();return $this->unexpected($e);}
    }

    public function link(int|string $personId): ResponseInterface
    {
        if ($denied=$this->authorize())return $denied;
        $json=$this->request->getJSON(true);
        $userId=filter_var($json['user_id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($userId===false)return $this->error(422,'Selecione uma conta existente.');
        $id=(int)$personId;
        $db=db_connect();
        $db->transBegin();
        try {
            $person=$db->query('SELECT id, user_id FROM pessoas WHERE id = ? FOR UPDATE',[$id])->getRowArray();
            if(!$person){$db->transRollback();return $this->error(404,'Pessoa não encontrada.');}
            if($person['user_id']){$db->transRollback();return $this->error(409,'Esta pessoa já possui acesso.');}
            if($db->table('pessoas')->where('user_id',$userId)->countAllResults()>0){
                $db->transRollback();return $this->error(409,'Esta conta já pertence a outra pessoa.');
            }
            $user=auth()->getProvider()->findById($userId);
            if(!$user){$db->transRollback();return $this->error(404,'Usuário não encontrado.');}
            $db->table('pessoas')->where('id',$id)->update([
                'user_id'=>(int)$userId,'atualizado_em'=>date('Y-m-d H:i:s'),
            ]);
            $this->audit($db,$id,'VINCULAR_ACESSO',['user_id'=>(int)$userId,'username'=>$user->username]);
            $this->commit($db);
            return $this->ok('Conta existente vinculada à pessoa.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e);}
    }

    public function update(int|string $userId): ResponseInterface
    {
        if ($denied=$this->authorize())return $denied;
        $data=$this->request->getJSON(true);
        $valid=$this->validateAccount(is_array($data)?$data:[], false);
        if(isset($valid['error']))return $this->error(422,$valid['error']);

        $id=(int)$userId;
        $db=db_connect();
        $db->transBegin();
        try {
            $provider=auth()->getProvider();
            $user=$provider->findById($id);
            if(!$user){$db->transRollback();return $this->error(404,'Usuário não encontrado.');}
            if($user->inGroup('admin') || $id===(int)auth('session')->user()->id){
                $db->transRollback();return $this->error(403,'A conta do administrador é protegida.');
            }
            $linked=$db->table('pessoas')->where('user_id',$id)->get()->getRowArray();
            if(!$linked){
                $db->transRollback();return $this->error(409,'Vincule esta conta a uma pessoa antes de alterá-la.');
            }
            if(!$this->personHasRole($db,(int)$linked['id'],$valid['group'])){
                $db->transRollback();return $this->error(422,'Cadastre este papel na pessoa antes de atribuir o grupo.');
            }
            $different=$provider->findByCredentials(['username'=>$valid['username']]);
            if($different && (int)$different->id!==$id){
                $db->transRollback();return $this->error(409,'Nome de usuário já utilizado.');
            }
            $different=$provider->findByCredentials(['email'=>$valid['email']]);
            if($different && (int)$different->id!==$id){
                $db->transRollback();return $this->error(409,'E-mail já utilizado.');
            }
            $before=['username'=>$user->username,'email'=>$user->email,'group'=>$user->getGroups()];
            $changes=['username'=>$valid['username'],'email'=>$valid['email']];
            if($valid['password']!=='')$changes['password']=$valid['password'];
            $user->fill($changes);
            $provider->save($user);
            $user->syncGroups($valid['group']);
            $this->audit($db,(int)$linked['id'],'ALTERAR_ACESSO',[
                'antes'=>$before,
                'depois'=>['username'=>$valid['username'],'email'=>$valid['email'],'group'=>$valid['group'],
                    'senha_alterada'=>$valid['password']!==''],
            ]);
            $this->commit($db);
            return $this->ok('Acesso atualizado com sucesso.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e);}
    }

    public function state(int|string $userId): ResponseInterface
    {
        if ($denied=$this->authorize())return $denied;
        $data=$this->request->getJSON(true);
        if(!is_array($data)||!isset($data['ativo'])||!is_bool($data['ativo'])){
            return $this->error(422,'Informe a situação do acesso.');
        }
        $id=(int)$userId;
        $db=db_connect();
        $db->transBegin();
        try{
            $user=auth()->getProvider()->findById($id);
            if(!$user){$db->transRollback();return $this->error(404,'Usuário não encontrado.');}
            if($user->inGroup('admin') || $id===(int)auth('session')->user()->id){
                $db->transRollback();return $this->error(403,'Não é permitido desativar ou modificar a conta administrativa.');
            }
            if($data['ativo']){
                $person=$db->table('pessoas')->where('user_id',$id)->get()->getRowArray();
                if(!$person || !(bool)$person['ativo']){
                    $db->transRollback();return $this->error(409,'A pessoa vinculada precisa estar ativa.');
                }
                $user->unBan();
                $user->activate();
            }else{
                $user->ban('Acesso desativado pelo administrador SPLASH.');
            }
            $person=$db->table('pessoas')->where('user_id',$id)->get()->getRowArray();
            $this->audit($db,$person ? (int)$person['id'] : null,'SITUACAO_ACESSO',[
                'user_id'=>$id,'ativo'=>$data['ativo'],
            ]);
            $this->commit($db);
            return $this->ok($data['ativo']?'Acesso ativado.':'Acesso desativado.');
        }catch(Throwable $e){$db->transRollback();return $this->unexpected($e);}
    }

    private function validateAccount(array $data,bool $creating): array
    {
        $name=trim((string)($data['username']??''));
        $email=trim((string)($data['email']??''));
        $password=(string)($data['password']??'');
        $group=(string)($data['group']??'');
        if(!preg_match('/^[A-Za-z0-9._-]{3,30}$/D',$name)){
            return ['error'=>'Usuário deve ter 3 a 30 caracteres: letras sem espaço, números, ponto, traço ou sublinhado.'];
        }
        if(strlen($email)>254||!filter_var($email,FILTER_VALIDATE_EMAIL)){
            return ['error'=>'Informe um e-mail válido para recuperar o acesso.'];
        }
        if(!in_array($group,self::GROUPS,true)){
            return ['error'=>'Escolha um grupo válido (corretor, vendedor ou gerente).'];
        }
        if($creating || $password!==''){
            if(strlen($password)<8 || strlen($password)>128 || !preg_match('/[A-Z]/',$password)
                || !preg_match('/[0-9]/',$password)){
                return ['error'=>'A senha deve ter 8 a 128 caracteres, pelo menos uma letra maiúscula e um número.'];
            }
        }
        return ['username'=>$name,'email'=>$email,'password'=>$password,'group'=>$group];
    }

    private function personHasRole($db,int $id,string $role): bool
    {
        return $db->table('pessoa_papeis')->where('pessoa_id',$id)->where('papel',$role)
            ->countAllResults()>0;
    }

    private function audit($db,?int $personId,string $action,array $data): void
    {
        $db->table('pessoa_auditoria')->insert([
            'pessoa_id'=>$personId,'usuario_autor_id'=>(int)auth('session')->user()->id,
            'acao'=>$action, 'dados_antes'=>null,
            'dados_depois'=>json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
    }

    private function commit($db): void
    {
        if($db->transStatus()===false)throw new \RuntimeException('Falha de gravação.');
        $db->transCommit();
    }

    private function ok(string $message,int $status=200): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,'csrf'=>['header'=>config('Security')->headerName,'hash'=>csrf_hash()],
        ])->setHeader('Cache-Control','no-store');
    }

    private function error(int $status,string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message'=>$message,'csrf'=>['header'=>config('Security')->headerName,'hash'=>csrf_hash()],
        ]);
    }

    private function unexpected(Throwable $e): ResponseInterface
    {
        log_message('error','SPLASH usuarios: {message}',['message'=>$e->getMessage()]);
        return $this->error(500,'Não foi possível concluir a operação. Confira o log do servidor.');
    }
}
