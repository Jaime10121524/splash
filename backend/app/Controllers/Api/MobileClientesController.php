<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\ClienteRules;
use App\Libraries\BonificacaoIndicacao;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

final class MobileClientesController extends BaseController
{
    private function error(int $status,string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['message'=>$message])
            ->setHeader('Cache-Control','no-store');
    }
    private function actor(): array|ResponseInterface
    {
        $u=auth('tokens')->user();
        if (!$u || $u->isBanned()) return $this->error(401,'Sessão expirada.');
        if (!$u->inGroup('admin','operador','gerente','corretor')) return $this->error(403,'Perfil sem acesso a clientes.');
        $scope=null;
        if ($u->inGroup('corretor') && !$u->inGroup('admin','operador','gerente')) {
            $p=db_connect()->table('pessoas')->select('id')
                ->where('user_id',(int)$u->id)->where('ativo',1)->get()->getRowArray();
            if (!$p) return $this->error(403,'Conta sem corretor vinculado.');
            $scope=(int)$p['id'];
        }
        return ['user'=>$u,'scope'=>$scope];
    }
    private function id($value): ?int
    {
        if (!is_string($value) && !is_int($value))return null;
        $n=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        return $n===false?null:(int)$n;
    }
    private function row($db)
    {
        return $db->table('clientes c')->select('c.*,o.nome AS origem_nome,p.nome AS dono_corrente_nome,
            i.nome AS indicador_nome')
            ->join('lead_origens o','o.id=c.origem_id','left')
            ->join('pessoas p','p.id=c.dono_corrente_pessoa_id','left')
            ->join('clientes i','i.id=c.indicador_cliente_id','left');
    }
    private function cast(array $r): array
    {
        foreach(['id','dono_corrente_pessoa_id','origem_id','indicador_cliente_id'] as $key)
            $r[$key]=($r[$key]??null)===null?null:(int)$r[$key];
        $r['ativo']=(bool)$r['ativo'];
        return $r;
    }
    public function index(): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $q=trim((string)($this->request->getGet('q')??''));
        if(mb_strlen($q)>120)return $this->error(422,'Pesquisa muito longa.');
        $page=max(1,min(10000,(int)($this->request->getGet('page')?:1)));
        $limit=max(1,min(50,(int)($this->request->getGet('limit')?:25)));
        $builder=$this->row(db_connect());
        if($a['scope']!==null)$builder->where('c.dono_corrente_pessoa_id',$a['scope']);
        if($q!==''){
            $digits=preg_replace('/\D/','',$q);
            $builder->groupStart()->like('c.nome',$q);
            if(strlen($digits)>=3)$builder->orLike('c.telefone',$digits)->orLike('c.cpf',$digits);
            $builder->groupEnd();
        }
        $total=$builder->countAllResults(false);
        $rows=$builder->orderBy('c.id','DESC')->limit($limit,($page-1)*$limit)
            ->get()->getResultArray();
        return $this->response->setJSON([
            'clientes'=>array_map($this->cast(...),$rows),
            'total'=>(int)$total,'page'=>$page,'limit'=>$limit,
        ])->setHeader('Cache-Control','no-store');
    }
    public function show(int|string $id): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $n=$this->id($id);if(!$n)return $this->error(404,'Cliente não encontrado.');
        $builder=$this->row(db_connect())->where('c.id',$n);
        if($a['scope']!==null)$builder->where('c.dono_corrente_pessoa_id',$a['scope']);
        $row=$builder->get()->getRowArray();
        if(!$row)return $this->error(404,'Cliente não encontrado.');
        return $this->response->setJSON(['cliente'=>$this->cast($row)])
            ->setHeader('Cache-Control','no-store');
    }
    public function create(): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $input=$this->request->getJSON(true);
        if(!is_array($input))return $this->error(422,'Informe os dados do cliente.');
        if($a['scope']!==null)$input['dono_corrente_pessoa_id']=$a['scope'];
        $input['ativo']=true;
        $db=db_connect();$db->transBegin();
        try {
            $clean=ClienteRules::validate($db,$input);
            if(isset($clean['error'])){$db->transRollback();return $this->error(422,$clean['error']);}
            if($a['scope']!==null&&(int)$clean['dono_corrente_pessoa_id']!==$a['scope']){
                $db->transRollback();return $this->error(403,'A indicação pertence a outra corrente.');
            }
            $now=date('Y-m-d H:i:s');
            $db->table('clientes')->insert([...$clean,'criado_por_usuario_id'=>(int)$a['user']->id,'criado_em'=>$now]);
            $id=(int)$db->insertID();if($id<1)throw new \RuntimeException('Falha no novo cliente.');
            $db->table('cliente_corrente_historico')->insert([
                'cliente_id'=>$id,'dono_anterior_pessoa_id'=>null,
                'dono_novo_pessoa_id'=>(int)$clean['dono_corrente_pessoa_id'],
                'origem'=>$clean['indicador_cliente_id']?'INDICACAO':'CADASTRO',
                'usuario_id'=>(int)$a['user']->id,'criado_em'=>$now,
            ]);
            $bonus=BonificacaoIndicacao::registrar($db,$id,$clean,$input,$a['user']);
            if(isset($bonus['error'])){$db->transRollback();return $this->error(422,$bonus['error']);}
            if($db->transStatus()===false)throw new \RuntimeException('Falha na transação.');
            $db->transCommit();
            return $this->response->setStatusCode(201)->setJSON(['message'=>'Cliente cadastrado.','cliente_id'=>$id])
                ->setHeader('Cache-Control','no-store');
        } catch(Throwable $e){$db->transRollback();log_message('error','Cliente mobile: '.$e->getMessage());return $this->error(500,'Falha ao salvar cliente.');}
    }
    public function update(int|string $id): ResponseInterface
    {
        $a=$this->actor();if($a instanceof ResponseInterface)return $a;
        $n=$this->id($id);if(!$n)return $this->error(404,'Cliente não encontrado.');
        $input=$this->request->getJSON(true);
        if(!is_array($input))return $this->error(422,'Informe os dados do cliente.');
        $db=db_connect();$db->transBegin();
        try {
            $old=$db->query('SELECT * FROM clientes WHERE id=? FOR UPDATE',[$n])->getRowArray();
            if(!$old||($a['scope']!==null&&(int)$old['dono_corrente_pessoa_id']!==$a['scope'])){
                $db->transRollback();return $this->error(404,'Cliente não encontrado.');
            }
            $fields=['nome','telefone','cpf','email','data_nascimento','endereco',
                'profissao','observacoes','origem_id','indicador_cliente_id','dono_corrente_pessoa_id',
                'motivo_corrente'];
            $allowed=[];
            foreach($fields as $key)if(array_key_exists($key,$input))$allowed[$key]=$input[$key];
            $combined=array_replace($old,$allowed);
            if($a['scope']!==null)$combined['dono_corrente_pessoa_id']=$a['scope'];
            $combined['ativo']=(bool)$old['ativo'];
            $clean=ClienteRules::validate($db,$combined,$old);
            if(isset($clean['error'])){$db->transRollback();return $this->error(422,$clean['error']);}
            if($a['scope']!==null&&(int)$clean['dono_corrente_pessoa_id']!==$a['scope']){
                $db->transRollback();return $this->error(403,'Corrente de outro corretor.');
            }
            $oldOwner=(int)$old['dono_corrente_pessoa_id'];
            $newOwner=(int)$clean['dono_corrente_pessoa_id'];
            $now=date('Y-m-d H:i:s');
            $db->table('clientes')->where('id',$n)->update([...$clean,'atualizado_em'=>$now]);
            if($oldOwner!==$newOwner){
                $db->table('cliente_corrente_historico')->insert([
                    'cliente_id'=>$n,'dono_anterior_pessoa_id'=>$oldOwner,
                    'dono_novo_pessoa_id'=>$newOwner,
                    'origem'=>($old['indicador_cliente_id']??null)!==($clean['indicador_cliente_id']??null)
                        ?'INDICACAO':'AJUSTE_MANUAL',
                    'justificativa'=>trim((string)($input['motivo_corrente']??''))?:null,
                    'usuario_id'=>(int)$a['user']->id,'criado_em'=>$now,
                ]);
            }
            if($db->transStatus()===false)throw new \RuntimeException('Falha na atualização.');
            $db->transCommit();
            return $this->response->setJSON(['message'=>'Cadastro atualizado.'])
                ->setHeader('Cache-Control','no-store');
        } catch(Throwable $e){$db->transRollback();log_message('error','Editar cliente mobile: '.$e->getMessage());return $this->error(500,'Falha ao atualizar cliente.');}
    }
}
