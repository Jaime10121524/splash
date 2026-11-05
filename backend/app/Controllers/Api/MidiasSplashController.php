<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\ProtecaoVendaFechada;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Fotos são arquivos PRIVADOS em writable/uploads/splash, nunca blobs no BD.
 * O nome deriva da ID autorizada (não do nome enviado). Cada acesso exige
 * a sessão web ou o token Shield mobile validado pela respectiva rota.
 */
final class MidiasSplashController extends BaseController
{
    private function fail(int $status,string $message):ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['message'=>$message])
            ->setHeader('Cache-Control','no-store');
    }

    private function actor(bool $mobile):array|ResponseInterface
    {
        $u=auth($mobile?'tokens':'session')->user();
        if(!$u||$u->isBanned())return $this->fail(401,'Sessão expirada.');
        return ['user'=>$u,'admin'=>$u->inGroup('admin')];
    }

    private function operation(int|string $id,bool $mobile,array $a):array|ResponseInterface
    {
        $saleId=filter_var($id,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($saleId===false)return $this->fail(404,'Venda não encontrada.');
        $db=db_connect();
        $op=$db->table('venda_operacoes')->select('id,visita_id,corretor_pessoa_id,segundo_corretor_pessoa_id')
            ->where('id',(int)$saleId)->get()->getRowArray();
        if(!$op)return $this->fail(404,'Venda não encontrada.');
        if(!$mobile && !$a['admin'])return $this->fail(403,'Somente o administrador consulta esta venda no site.');
        if($mobile && !$a['admin'] && !$a['user']->inGroup('gerente','operador')){
            $person=$db->table('pessoas')->select('id')->where('user_id',(int)$a['user']->id)
                ->where('ativo',1)->get()->getRowArray();
            if(!$person)return $this->fail(403,'Usuário sem corretor vinculado.');
            $pid=(int)$person['id'];$allowed=in_array($pid,[(int)$op['corretor_pessoa_id'],
                (int)($op['segundo_corretor_pessoa_id']??0)],true);
            if(!$allowed && $op['visita_id']){
                $visit=$db->table('visitas')->select('criado_por_usuario_id')
                    ->where('id',(int)$op['visita_id'])->get()->getRowArray();
                $allowed=(int)($visit['criado_por_usuario_id']??0)===(int)$a['user']->id;
            }
            if(!$allowed)return $this->fail(404,'Venda não encontrada.');
        }
        return $op;
    }

    private function dir(string $kind):string
    {
        return WRITEPATH.'uploads'.DIRECTORY_SEPARATOR.'splash'.DIRECTORY_SEPARATOR.$kind.DIRECTORY_SEPARATOR;
    }
    private function stored(string $kind,int $id):?array
    {
        $dir=$this->dir($kind);
        foreach(['jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp'] as $ext=>$mime){
            $file=$dir.$id.'.'.$ext;
            if(is_file($file))return ['path'=>$file,'mime'=>$mime];
        }
        return null;
    }
    private function show(string $kind,int $id):ResponseInterface
    {
        $item=$this->stored($kind,$id);
        if(!$item)return $this->fail(404,'Foto ainda não cadastrada.');
        $data=file_get_contents($item['path']);
        if($data===false)return $this->fail(500,'Não foi possível abrir a foto.');
        return $this->response->setBody($data)->setContentType($item['mime'])
            ->setHeader('Cache-Control','private, no-store')
            ->setHeader('X-Content-Type-Options','nosniff');
    }
    private function upload(string $kind,int $id):ResponseInterface
    {
        $file=$this->request->getFile('foto');
        if(!$file||!$file->isValid()||$file->hasMoved()){
            // Limites upload_max_filesize/post_max_size e erros de arquivo chegam aqui.
            log_message('warning','SPLASH foto recusada antes de validar: {erro}',[
                'erro'=>$file?$file->getErrorString():'Arquivo nao recebido no campo foto',
            ]);
            return $this->fail(422,'Não foi possível receber a foto. Confira o tamanho e os limites de upload do servidor.');
        }
        $limit=$kind==='perfis'?2097152:5242880;
        if($file->getSize()<1||$file->getSize()>$limit)
            return $this->fail(422,'Foto muito grande. Limite: '.($limit/1048576).' MB.');

        $temp=$file->getTempName();
        $info=@getimagesize($temp);
        if(!$info||($info[0]??0)<40||($info[1]??0)<40
            ||($info[0]??0)>8000||($info[1]??0)>8000)
            return $this->fail(422,'A foto deve ser uma imagem válida (40 a 8000 pixels por dimensão).');
        if(!class_exists(\finfo::class)){
            log_message('error','SPLASH foto: extensao PHP fileinfo indisponivel.');
            return $this->fail(503,'O servidor precisa habilitar a extensão PHP fileinfo para receber imagens.');
        }
        try{
            $type=(new \finfo(FILEINFO_MIME_TYPE))->file($temp);
            $ext=match($type){'image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp',default=>null};
            if(!$ext||($info['mime']??'')!==$type)
                return $this->fail(422,'Envie uma imagem JPG, PNG ou WebP.');

            // O writable permanece privado. Em hospedagem compartilhada,
            // as pastas precisam pertencer ao mesmo usuario do PHP.
            $dir=$this->dir($kind);
            if(!is_dir($dir)&&!@mkdir($dir,0750,true)&&!is_dir($dir)){
                log_message('error','SPLASH foto: nao foi possivel criar diretorio de uploads ({kind}).',[
                    'kind'=>$kind,
                ]);
                return $this->fail(500,'A pasta de fotos não pôde ser criada. Verifique writable/uploads no servidor.');
            }
            if(!is_writable($dir)){
                log_message('error','SPLASH foto: diretorio de uploads sem escrita ({kind}).',[
                    'kind'=>$kind,
                ]);
                return $this->fail(500,'A pasta de fotos não permite escrita. Verifique as permissões do servidor.');
            }
            $name=$id.'.'.$ext;
            if(!$file->move($dir,$name,true)){
                log_message('error','SPLASH foto: move falhou ({kind}).',['kind'=>$kind]);
                return $this->fail(500,'Falha ao gravar a foto no servidor. Confira as permissões da pasta.');
            }
            foreach(['jpg','png','webp'] as $oldExt){
                if($oldExt!==$ext&&is_file($dir.$id.'.'.$oldExt))@unlink($dir.$id.'.'.$oldExt);
            }
            return $this->response->setJSON(['message'=>'Foto enviada com sucesso.','foto_disponivel'=>true])
                ->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){
            log_message('error','SPLASH upload foto ({kind}): {error}',[
                'kind'=>$kind,'error'=>$e->getMessage(),
            ]);
            return $this->fail(500,'Falha ao salvar foto. Confira writable/uploads e o log PHP.');
        }
    }

    public function avatarWeb():ResponseInterface
    {
        $a=$this->actor(false);if($a instanceof ResponseInterface)return $a;
        return $this->show('perfis',(int)$a['user']->id);
    }
    public function avatarMobile():ResponseInterface
    {
        $a=$this->actor(true);if($a instanceof ResponseInterface)return $a;
        return $this->show('perfis',(int)$a['user']->id);
    }
    public function uploadAvatarWeb():ResponseInterface
    {
        $a=$this->actor(false);if($a instanceof ResponseInterface)return $a;
        return $this->upload('perfis',(int)$a['user']->id);
    }
    public function uploadAvatarMobile():ResponseInterface
    {
        $a=$this->actor(true);if($a instanceof ResponseInterface)return $a;
        return $this->upload('perfis',(int)$a['user']->id);
    }
    public function vendaWeb(int|string $id):ResponseInterface
    {
        $a=$this->actor(false);if($a instanceof ResponseInterface)return $a;
        $sale=$this->operation($id,false,$a);if($sale instanceof ResponseInterface)return $sale;
        return $this->show('vendas',(int)$sale['id']);
    }
    public function vendaMobile(int|string $id):ResponseInterface
    {
        $a=$this->actor(true);if($a instanceof ResponseInterface)return $a;
        $sale=$this->operation($id,true,$a);if($sale instanceof ResponseInterface)return $sale;
        return $this->show('vendas',(int)$sale['id']);
    }
    private function protegerFotoVenda(int $saleId):?ResponseInterface
    {
        if(ProtecaoVendaFechada::bloqueada(db_connect(),$saleId)){
            return $this->fail(409,'Venda vinculada a fechamento: não é permitido alterar a foto.');
        }
        return null;
    }

    public function uploadVendaWeb(int|string $id):ResponseInterface
    {
        $a=$this->actor(false);if($a instanceof ResponseInterface)return $a;
        $sale=$this->operation($id,false,$a);if($sale instanceof ResponseInterface)return $sale;
        if($blocked=$this->protegerFotoVenda((int)$sale['id']))return $blocked;
        return $this->upload('vendas',(int)$sale['id']);
    }
    public function uploadVendaMobile(int|string $id):ResponseInterface
    {
        $a=$this->actor(true);if($a instanceof ResponseInterface)return $a;
        $sale=$this->operation($id,true,$a);if($sale instanceof ResponseInterface)return $sale;
        if($blocked=$this->protegerFotoVenda((int)$sale['id']))return $blocked;
        return $this->upload('vendas',(int)$sale['id']);
    }
}
