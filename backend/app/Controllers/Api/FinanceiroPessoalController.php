<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

class FinanceiroPessoalController extends CommercialBaseController
{
    private function actor(): array|ResponseInterface
    {
        $user=auth('session')->user();
        if(!$user||$user->isBanned())return $this->errorResponse(401,'Faça login novamente.');
        $admin=$user->inGroup('admin')&&$user->can('visits.manage');
        $allowed=$admin || $user->inGroup('corretor') || $user->inGroup('vendedor') || $user->inGroup('gerente');
        if(!$allowed)return $this->errorResponse(403,'Acesso ao financeiro pessoal não autorizado.');
        $own=null;
        if(!$admin){
            $person=db_connect()->table('pessoas')->select('id')->where('user_id',(int)$user->id)
                ->where('ativo',1)->get()->getRowArray();
            if(!$person)return $this->errorResponse(403,'Usuário sem pessoa ativa vinculada.');
            $own=(int)$person['id'];
        }
        return ['admin'=>$admin,'own'=>$own,'user_id'=>(int)$user->id];
    }

    private function target(array $actor,mixed $requested): int|false
    {
        if(!$actor['admin'])return (int)$actor['own'];
        $id=$this->optionalId($requested);
        return $id?:false;
    }

    private function amount(mixed $raw): ?int
    {
        $c=VendaMoney::cents($raw);
        return ($c!==null && $c>0)?$c:null;
    }

    public function index(): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        $id=null;
        if(!$actor['admin'])$id=$actor['own'];
        else{
            $input=$this->request->getGet('pessoa_id');
            if($input!==null && $input!==''){
                $id=$this->optionalId($input);
                if(!$id)return $this->errorResponse(422,'Pessoa inválida.');
            }
        }
        $start=(string)($this->request->getGet('inicio')??date('Y-m-01'));
        $end=(string)($this->request->getGet('fim')??date('Y-m-t'));
        if(!$this->validateDate($start)||!$this->validateDate($end)||$start>$end){
            return $this->errorResponse(422,'Período inválido.');
        }
        $db=db_connect();
        $categories=$db->table('financeiro_categorias_despesa')->where('ativo',1)
            ->groupStart()->where('pessoa_id',null);
        if($id)$categories->orWhere('pessoa_id',$id);
        $categoryRows=$categories->groupEnd()->orderBy('nome','ASC')->get()->getResultArray();

        $expensesQuery=$db->table('financeiro_despesas d')
            ->select('d.id,d.pessoa_id,d.categoria_id,d.data_despesa,d.valor,d.descricao,d.situacao,c.nome AS categoria_nome,p.nome AS pessoa_nome')
            ->join('financeiro_categorias_despesa c','c.id=d.categoria_id')
            ->join('pessoas p','p.id=d.pessoa_id')
            ->where('d.data_despesa >=',$start)->where('d.data_despesa <=',$end);
        if($id)$expensesQuery->where('d.pessoa_id',$id);
        $expenses=$expensesQuery->orderBy('d.id','DESC')->limit(500)->get()->getResultArray();

        $loansQuery=$db->table('financeiro_emprestimos e')
            ->select('e.id,e.pessoa_id,e.data_emprestimo,e.valor,e.descricao,e.situacao,p.nome AS pessoa_nome')
            ->join('pessoas p','p.id=e.pessoa_id');
        if($id)$loansQuery->where('e.pessoa_id',$id);
        $loans=$loansQuery->orderBy('e.id','DESC')->limit(500)->get()->getResultArray();
        $loanIds=array_map(static fn($x)=>(int)$x['id'],$loans);
        $paid=[];
        $history=[];
        if($loanIds){
            foreach($db->table('financeiro_emprestimo_abates a')
                ->select('a.id,a.emprestimo_id,a.lote_id,a.valor,a.data_abate')
                ->whereIn('a.emprestimo_id',$loanIds)
                ->orderBy('a.id','ASC')->get()->getResultArray() as $m){
                $key=(int)$m['emprestimo_id'];
                $paid[$key]=($paid[$key]??0)+VendaMoney::cents((string)$m['valor'],true);
                $history[$key][]=$m;
            }
        }
        foreach($loans as &$loan){
            $original=VendaMoney::cents((string)$loan['valor'],true);
            $abates=$paid[(int)$loan['id']]??0;
            $loan['abatido']=VendaMoney::decimal($abates);
            $loan['saldo']=VendaMoney::decimal(max(0,$original-$abates));
            $loan['abatimentos']=$history[(int)$loan['id']]??[];
        }
        unset($loan);
        $expTotal=0;
        foreach($expenses as $exp)if($exp['situacao']==='ATIVA')$expTotal+=VendaMoney::cents((string)$exp['valor'],true);
        return $this->response->setJSON([
            'categorias'=>$categoryRows,'despesas'=>$expenses,'emprestimos'=>$loans,
            'resumo'=>['despesas_periodo'=>VendaMoney::decimal($expTotal),
                'saldo_emprestimos'=>VendaMoney::decimal(array_sum(array_map(
                    static fn($loan)=>VendaMoney::cents((string)$loan['saldo'],true),$loans)))],
            'inicio'=>$start,'fim'=>$end,
            'limite_resultados'=>500,
        ])->setHeader('Cache-Control','no-store');
    }

    public function cadastrarCategoria(): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        $input=$this->jsonPayload();
        $name=$this->cleanText($input['nome']??null,90,true);
        $person=$this->target($actor,$input['pessoa_id']??null);
        if($name===false||!$person)return $this->errorResponse(422,'Informe a pessoa e o nome da categoria.');
        $db=db_connect();
        if(!$db->table('pessoas')->where('id',$person)->where('ativo',1)->countAllResults()){
            return $this->errorResponse(404,'Pessoa não encontrada.');
        }
        $db->table('financeiro_categorias_despesa')->insert([
            'nome'=>$name,'pessoa_id'=>$person,'ativo'=>1,
        ]);
        return $this->responseOK('Categoria de despesa cadastrada.');
    }

    public function cadastrarDespesa(): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        $input=$this->jsonPayload();
        $person=$this->target($actor,$input['pessoa_id']??null);
        $category=$this->optionalId($input['categoria_id']??null);
        $date=(string)($input['data_despesa']??'');
        $amount=$this->amount($input['valor']??null);
        $description=$this->cleanText($input['descricao']??null,500,true);
        if(!$person||!$category||!$this->validateDate($date)||!$amount||$description===false){
            return $this->errorResponse(422,'Preencha pessoa, categoria, data, valor e descrição.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $personRow=$db->table('pessoas')->where('id',$person)->where('ativo',1)->get()->getRowArray();
            $cat=$db->table('financeiro_categorias_despesa')->where('id',$category)->where('ativo',1)->get()->getRowArray();
            if(!$personRow||!$cat || ($cat['pessoa_id']!==null && (int)$cat['pessoa_id']!==(int)$person)){
                $db->transRollback();return $this->errorResponse(422,'Pessoa ou categoria inválida para esta conta.');
            }
            $db->table('financeiro_despesas')->insert([
                'pessoa_id'=>$person,'categoria_id'=>$category,'data_despesa'=>$date,
                'valor'=>VendaMoney::decimal($amount),'descricao'=>$description,
                'situacao'=>'ATIVA','criado_por_usuario_id'=>$actor['user_id'],
                'criado_em'=>date('Y-m-d H:i:s'),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Despesa registrada na conta da pessoa.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'cadastrar despesa');
        }
    }

    public function cancelarDespesa(int|string $id): ResponseInterface
    {
        $actor=$this->actor();
        if($actor instanceof ResponseInterface)return $actor;
        $reason=$this->cleanText($this->jsonPayload()['justificativa']??null,500,true);
        if($reason===false||mb_strlen((string)$reason)<5){
            return $this->errorResponse(422,'Informe o motivo do cancelamento (mínimo cinco caracteres).');
        }
        $db=db_connect();$db->transBegin();
        try{
            $expense=$db->table('financeiro_despesas')->where('id',(int)$id)->get()->getRowArray();
            if(!$expense||(!$actor['admin']&&(int)$expense['pessoa_id']!==$actor['own'])){
                $db->transRollback();return $this->errorResponse(404,'Despesa não encontrada.');
            }
            if($expense['situacao']!=='ATIVA'){
                $db->transRollback();return $this->errorResponse(409,'Despesa já cancelada.');
            }
            $db->table('financeiro_despesas')->where('id',(int)$id)->update([
                'situacao'=>'CANCELADA','justificativa_cancelamento'=>$reason,
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Despesa cancelada com histórico preservado.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'cancelar despesa');
        }
    }

    public function cadastrarEmprestimo(): ResponseInterface
    {
        if($denied=$this->authorizeAdmin())return $denied;
        $input=$this->jsonPayload();
        $person=$this->optionalId($input['pessoa_id']??null);
        $date=(string)($input['data_emprestimo']??'');
        $amount=$this->amount($input['valor']??null);
        $description=$this->cleanText($input['descricao']??null,500,true);
        if(!$person||!$this->validateDate($date)||!$amount||$description===false){
            return $this->errorResponse(422,'Informe pessoa, data, valor emprestado e descrição.');
        }
        $db=db_connect();
        if(!$db->table('pessoas')->where('id',$person)->where('ativo',1)->countAllResults()){
            return $this->errorResponse(422,'Pessoa não encontrada.');
        }
        $db->table('financeiro_emprestimos')->insert([
            'pessoa_id'=>$person,'data_emprestimo'=>$date,
            'valor'=>VendaMoney::decimal($amount),'descricao'=>$description,
            'situacao'=>'ATIVO','criado_por_usuario_id'=>(int)auth('session')->user()->id,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
        return $this->responseOK('Empréstimo registrado para esta pessoa. O abatimento será negociado no fechamento.');
    }
}
