<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\VendaMoney;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Apenas o administrador vê dados pessoais, cobranças e saldos de terceiros.
 * Corretor/vendedor terão futura API própria com escopo por pessoa e sem PII.
 */
class VendasController extends CommercialBaseController
{
    private function guard(): ?ResponseInterface
    {
        return $this->authorizeAdmin();
    }

    public function opcoes(): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $db=db_connect();
        $plans=$db->table('plano_versoes v')->select('v.*,p.id AS familia_id')
            ->join('planos p','p.id=v.plano_id')->orderBy('v.id','DESC')->get()->getResultArray();
        foreach($plans as &$p)$p['ativo']=(bool)$p['ativo'];
        unset($p);
        $rules=$db->table('venda_regras_comissao')->orderBy('id','ASC')->get()->getResultArray();
        foreach($rules as &$r)$r['ativo']=(bool)$r['ativo'];
        unset($r);
        $methods=$db->table('venda_formas_pagamento')->orderBy('id','ASC')->get()->getResultArray();
        foreach($methods as &$m){$m['ativo']=(bool)$m['ativo'];$m['credito']=(bool)$m['credito'];}
        unset($m);
        return $this->response->setJSON(['planos'=>$plans,'regras'=>$rules,'formas'=>$methods])
            ->setHeader('Cache-Control','no-store');
    }

    public function resumo(): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $db=db_connect();
        $row=$db->table('venda_operacoes')->select("
            COUNT(*) AS total,
            SUM(CASE WHEN situacao='VENDA' THEN 1 ELSE 0 END) AS vendas,
            SUM(CASE WHEN situacao='PENDENCIA' THEN 1 ELSE 0 END) AS pendencias
        ",false)->get()->getRowArray();
        return $this->response->setJSON([
            'total'=>(int)($row['total']??0),
            'vendas'=>(int)($row['vendas']??0),
            'pendencias'=>(int)($row['pendencias']??0),
        ])->setHeader('Cache-Control','no-store');
    }

    public function index(): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $type=(string)($this->request->getGet('situacao')??'');
        if($type!==''&&!in_array($type,['PENDENCIA','VENDA'],true)) {
            return $this->errorResponse(422,'Situação inválida.');
        }
        $q=trim((string)($this->request->getGet('q')??''));
        if(mb_strlen($q)>90)return $this->errorResponse(422,'Pesquisa muito longa.');
        $db=db_connect();
        $query=$db->table('venda_operacoes o')
            ->select("o.*,c.nome AS cliente_nome,c.telefone AS cliente_telefone,
                cp.nome AS corretor_nome,sp.nome AS segundo_corretor_nome,
                dc.nome AS dono_corrente_nome,
                (SELECT COALESCE(SUM(CASE WHEN mov.tipo='ENTRADA' THEN mov.valor ELSE -mov.valor END),0)
                 FROM venda_recebimentos mov WHERE mov.operacao_id=o.id) AS recebido",false)
            ->join('clientes c','c.id=o.cliente_id')
            ->join('pessoas cp','cp.id=o.corretor_pessoa_id','left')
            ->join('pessoas sp','sp.id=o.segundo_corretor_pessoa_id','left')
            ->join('pessoas dc','dc.id=o.dono_corrente_pessoa_id','left');
        if($type!=='')$query->where('o.situacao',$type);
        if($q!==''){
            $query->groupStart()->like('c.nome',$q);
            if(preg_match('/^\d{1,4}$/',$q))$query->orLike('o.numero_titulo',$q);
            $query->groupEnd();
        }
        $rows=$query->orderBy('o.id','DESC')->limit(150)->get()->getResultArray();
        foreach($rows as &$row){
            $row['id']=(int)$row['id'];
            $row['cliente_id']=(int)$row['cliente_id'];
            $row['historica']=(bool)$row['historica'];
            $row['saldo']=VendaMoney::decimal(max(0,
                VendaMoney::cents((string)$row['valor_cobrado'],true)
                -VendaMoney::cents((string)$row['recebido'],true)
            ));
        }
        unset($row);
        return $this->response->setJSON(['operacoes'=>$rows,'limite'=>150])
            ->setHeader('Cache-Control','no-store');
    }

    public function detalhe(int|string $id): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $db=db_connect();
        $op=$db->table('venda_operacoes')->where('id',(int)$id)->get()->getRowArray();
        if(!$op)return $this->errorResponse(404,'Negociação não encontrada.');
        $movements=$db->table('venda_recebimentos r')
            ->select('r.*,f.nome AS forma_nome,f.codigo AS forma_codigo')
            ->join('venda_formas_pagamento f','f.id=r.forma_id')
            ->where('r.operacao_id',(int)$id)->orderBy('r.id','ASC')->get()->getResultArray();
        $received=0;
        foreach($movements as &$m){
            $m['id']=(int)$m['id'];
            $m['referencia_entrada_id']=$m['referencia_entrada_id']? (int)$m['referencia_entrada_id']:null;
            $value=VendaMoney::cents((string)$m['valor'],true);
            $received+=$m['tipo']==='ENTRADA'?$value:-$value;
        }
        unset($m);
        return $this->response->setJSON([
            'operacao'=>$op,'movimentos'=>$movements,
            'recebido'=>VendaMoney::decimal($received),
            'saldo'=>VendaMoney::decimal(max(0,VendaMoney::cents((string)$op['valor_cobrado'])-$received)),
        ])->setHeader('Cache-Control','no-store');
    }

    public function create(): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $data=$this->jsonPayload();
        $db=db_connect();
        $db->transBegin();
        try{
            $clientId=$this->optionalId($data['cliente_id']??null);
            $versionId=$this->optionalId($data['plano_versao_id']??null);
            $ruleId=$this->optionalId($data['regra_comissao_id']??null);
            $visitId=$this->optionalId($data['visita_id']??null);
            if(!$clientId||!$versionId||!$ruleId||$visitId===false){
                $db->transRollback();
                return $this->errorResponse(422,'Informe cliente, plano e regra de comissão válidos.');
            }
            $kind=(string)($data['situacao']??'');
            if(!in_array($kind,['PENDENCIA','VENDA'],true)){
                $db->transRollback();
                return $this->errorResponse(422,'Selecione Venda ou Pendência.');
            }
            $historic=($data['historica']??false)===true;
            $day=(string)($data['data_negociacao']??'');
            if(!$this->validateDate($day,false)){
                $db->transRollback();
                return $this->errorResponse(422,'Data da negociação inválida.');
            }
            $client=$db->table('clientes')->where('id',$clientId)->get()->getRowArray();
            $plan=$db->table('plano_versoes')->where('id',$versionId)->get()->getRowArray();
            $rule=$db->table('venda_regras_comissao')->where('id',$ruleId)->get()->getRowArray();
            if(!$client || !$plan || !$rule || (!$historic && (!(bool)$plan['ativo'] || !(bool)$rule['ativo']))){
                $db->transRollback();
                return $this->errorResponse(422,'Cliente, plano ou regra inexistente/inativa.');
            }
            $visit=null;
            if($visitId){
                $visit=$db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE',[$visitId])->getRowArray();
                if(!$visit || (int)$visit['cliente_id']!==$clientId){
                    $db->transRollback();
                    return $this->errorResponse(422,'O atendimento não pertence ao cliente informado.');
                }
                if($db->table('venda_operacoes')->where('visita_id',$visitId)->countAllResults()>0){
                    $db->transRollback();
                    return $this->errorResponse(409,'Este atendimento já possui uma negociação vinculada.');
                }
                if(($kind==='VENDA' && $visit['status']!=='VENDA')
                    ||($kind==='PENDENCIA' && !in_array($visit['status'],['PENDENCIA','VENDA'],true))){
                    $db->transRollback();
                    return $this->errorResponse(409,'Encerre o atendimento como Venda fechada ou Pendência antes de vincular.');
                }
            }
            $brokers=$this->participants($db,$data,$visit);
            if(isset($brokers['error'])){
                $db->transRollback();
                return $this->errorResponse(422,$brokers['error']);
            }
            $table=VendaMoney::cents((string)$plan['valor']);
            $discount=VendaMoney::cents($data['desconto_corretor']??'0',true);
            if($discount===null || $discount>=$table){
                $db->transRollback();
                return $this->errorResponse(422,'O desconto deve ser inferior ao valor do plano.');
            }
            $estimate=VendaMoney::estimate($rule,$table,0,$discount);
            if($estimate['valor']===null) {
                $db->transRollback();
                return $this->errorResponse(422,$estimate['aviso']);
            }
            $notes=$this->cleanText($data['observacoes']??null,4000);
            if($notes===false){
                $db->transRollback();
                return $this->errorResponse(422,'Observações excedem 4000 caracteres.');
            }
            $returnDay=$data['retorno_previsto']??null;
            if($returnDay==='')$returnDay=null;
            if($returnDay!==null&&!$this->validateDate($returnDay)){
                $db->transRollback();
                return $this->errorResponse(422,'Data de retorno inválida.');
            }
            $number=null;$saleDate=null;$start=null;$expiry=null;
            if($kind==='VENDA'){
                $number=$this->number($data['numero_titulo']??'');
                $saleDate=(string)($data['data_venda']??$day);
                $start=(string)($data['data_inicio']??$saleDate);
                if(!$number||!$this->validateDate($saleDate,false)||!$this->validateDate($start)){
                    $db->transRollback();
                    return $this->errorResponse(422,'Informe número de título com quatro dígitos e datas válidas.');
                }
                $expiry=$this->expiry($start,(int)$plan['duracao_meses']);
                if($this->numberExists($db,$number,(string)$plan['codigo'])){
                    $db->transRollback();
                    return $this->errorResponse(409,'Esse número e sigla já pertencem a outro título.');
                }
            }
            $now=$this->nowLocal();
            $db->table('venda_operacoes')->insert([
                'cliente_id'=>$clientId,'visita_id'=>$visitId,'plano_versao_id'=>$versionId,
                'situacao'=>$kind,'historica'=>$historic?1:0,'numero_titulo'=>$number,
                'sigla_plano'=>$plan['codigo'],'prazo_meses'=>(int)$plan['duracao_meses'],
                'valor_tabela'=>VendaMoney::decimal($table),
                'desconto_corretor'=>VendaMoney::decimal($discount),
                'valor_cobrado'=>VendaMoney::decimal($table-$discount),
                'regra_comissao_id'=>$ruleId,'regra_snapshot'=>json_encode([
                    'nome'=>$rule['nome'],'modalidade'=>$rule['modalidade'],
                    'numerador'=>(int)$rule['numerador'],'denominador'=>(int)$rule['denominador'],
                    'desconto_cartao'=>$rule['desconto_cartao'],
                ],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                'comissao_prevista'=>$estimate['valor'],
                'observacao_comissao'=>$estimate['aviso'],
                ...$brokers,
                'dono_corrente_pessoa_id'=>(int)$client['dono_corrente_pessoa_id'],
                'atendente_pessoa_id'=>$visit['atendente_pessoa_id']??null,
                'atendente_adicional_pessoa_id'=>$visit['atendente_adicional_pessoa_id']??null,
                'data_negociacao'=>$day,'data_venda'=>$saleDate,'data_inicio'=>$start,
                'data_vencimento'=>$expiry,'retorno_previsto'=>$kind==='PENDENCIA'?$returnDay:null,
                'observacoes'=>$notes,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$now,
            ]);
            $id=(int)$db->insertID();
            if($id<1)throw new \RuntimeException('Falha ao inserir operação.');
            $this->commitOrFail($db);
            return $this->responseOK($kind==='PENDENCIA'?'Pendência criada.':'Venda vinculada ao título.',201,['operacao_id'=>$id]);
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'criar venda');
        }
    }

    public function converter(int|string $id): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $data=$this->jsonPayload();
        $db=db_connect();
        $db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$op){
                $db->transRollback();
                return $this->errorResponse(404,'Negociação não encontrada.');
            }
            if($op['situacao']!=='PENDENCIA'){
                $db->transRollback();
                return $this->errorResponse(409,'Esta operação já foi convertida em venda.');
            }
            $number=$this->number($data['numero_titulo']??'');
            $date=(string)($data['data_venda']??'');
            $start=(string)($data['data_inicio']??$date);
            if(!$number || !$this->validateDate($date,false)||!$this->validateDate($start)){
                $db->transRollback();
                return $this->errorResponse(422,'Informe número com quatro dígitos, data da venda e início válidos.');
            }
            $expiry=$this->expiry($start,(int)$op['prazo_meses']);
            if($this->numberExists($db,$number,(string)$op['sigla_plano'])){
                $db->transRollback();
                return $this->errorResponse(409,'Esse número e sigla já pertencem a outro título.');
            }
            $db->table('venda_operacoes')->where('id',(int)$id)->update([
                'situacao'=>'VENDA','numero_titulo'=>$number,'data_venda'=>$date,
                'data_inicio'=>$start,'data_vencimento'=>$expiry,'retorno_previsto'=>null,
                'atualizado_em'=>$this->nowLocal(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Pendência convertida em venda; todos os pagamentos foram preservados.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'converter pendência');
        }
    }

    public function receber(int|string $id): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $data=$this->jsonPayload();
        $money=VendaMoney::cents($data['valor']??null);
        $methodId=$this->optionalId($data['forma_id']??null);
        $date=(string)($data['data_movimento']??'');
        if($money===null||!$methodId||!$this->validateDate($date,false)){
            return $this->errorResponse(422,'Valor, forma e data do recebimento são obrigatórios.');
        }
        $db=db_connect();
        $db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            $method=$db->table('venda_formas_pagamento')->where('id',$methodId)->get()->getRowArray();
            if(!$op||!$method ||!(bool)$method['ativo']){
                $db->transRollback();
                return $this->errorResponse(404,'Operação ou meio de pagamento não encontrado/ativo.');
            }
            // Evita registrar uma forma de pagamento que geraria comissão
            // incoerente com a regra congelada na operação.
            $ruleSnapshot=json_decode((string)$op['regra_snapshot'],true,512,JSON_THROW_ON_ERROR);
            $mode=(string)($ruleSnapshot['modalidade']??'');
            if(($mode==='AVISTA' && (bool)$method['credito'])
                ||($mode==='CARTAO' && !(bool)$method['credito'])
                ||($mode==='MISTO' && !(bool)$method['credito'] && $method['codigo']!=='PIX')){
                $db->transRollback();
                return $this->errorResponse(422,'Meio de pagamento incompatível com a regra escolhida. Use uma regra à vista, cartão ou mista adequada.');
            }
            $balance=$this->balance($db,(int)$id,$op);
            if($money>$balance){
                $db->transRollback();
                return $this->errorResponse(422,'O recebimento não pode ultrapassar o saldo a receber.');
            }
            $holder=(string)($data['detentor']??'');
            if($method['codigo']==='PIX')$holder='CORRETOR';
            elseif((bool)$method['credito'])$holder='EMPRESA';
            elseif(!in_array($holder,['CORRETOR','EMPRESA'],true)){
                $db->transRollback();
                return $this->errorResponse(422,'Informe com quem o valor recebido ficou.');
            }
            $note=$this->cleanText($data['observacoes']??null,500);
            if($note===false){
                $db->transRollback();
                return $this->errorResponse(422,'Observações ultrapassam 500 caracteres.');
            }
            $db->table('venda_recebimentos')->insert([
                'operacao_id'=>(int)$id,'tipo'=>'ENTRADA','referencia_entrada_id'=>null,
                'forma_id'=>$methodId,'detentor'=>$holder,'valor'=>VendaMoney::decimal($money),
                'data_movimento'=>$date,'observacoes'=>$note,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->nowLocal(),
            ]);
            $this->updateEstimate($db,(int)$id,$op);
            $this->commitOrFail($db);
            return $this->responseOK('Recebimento registrado. O extrato financeiro foi preservado.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'receber venda');
        }
    }

    public function devolver(int|string $id): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $data=$this->jsonPayload();
        $reference=$this->optionalId($data['entrada_id']??null);
        $amount=VendaMoney::cents($data['valor']??null);
        $date=(string)($data['data_movimento']??'');
        if(!$reference||$amount===null||!$this->validateDate($date,false)){
            return $this->errorResponse(422,'Informe o recebimento, valor e data da devolução.');
        }
        $note=$this->cleanText($data['observacoes']??null,500,true);
        if($note===false)return $this->errorResponse(422,'Informe o motivo da devolução (até 500 caracteres).');
        $db=db_connect();$db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            $original=$db->table('venda_recebimentos')->where('id',$reference)
                ->where('operacao_id',(int)$id)->where('tipo','ENTRADA')->get()->getRowArray();
            if(!$op||!$original){
                $db->transRollback();return $this->errorResponse(404,'Recebimento original não encontrado.');
            }
            $already=$db->table('venda_recebimentos')->selectSum('valor')
                ->where('referencia_entrada_id',$reference)->where('tipo','DEVOLUCAO')
                ->get()->getRowArray();
            $rem=VendaMoney::cents((string)$original['valor'])-
                VendaMoney::cents((string)($already['valor']??'0'),true);
            if($amount>$rem){
                $db->transRollback();
                return $this->errorResponse(422,'A devolução ultrapassa o saldo disponível nesse recebimento.');
            }
            $db->table('venda_recebimentos')->insert([
                'operacao_id'=>(int)$id,'tipo'=>'DEVOLUCAO','referencia_entrada_id'=>$reference,
                'forma_id'=>$original['forma_id'],'detentor'=>$original['detentor'],
                'valor'=>VendaMoney::decimal($amount),'data_movimento'=>$date,
                'observacoes'=>$note,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->nowLocal(),
            ]);
            $this->updateEstimate($db,(int)$id,$op);
            $this->commitOrFail($db);
            return $this->responseOK('Devolução registrada no mesmo detentor do recebimento original.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'devolução financeira');
        }
    }

    public function ajustarComissao(int|string $id): ResponseInterface
    {
        if($denied=$this->guard())return $denied;
        $data=$this->jsonPayload();
        $amount=VendaMoney::cents($data['valor']??null,true);
        $reason=$this->cleanText($data['justificativa']??null,500,true);
        if($amount===null || $reason===false || mb_strlen($reason)<5){
            return $this->errorResponse(422,'Informe a comissão ajustada e uma justificativa de pelo menos cinco caracteres.');
        }
        $db=db_connect();$db->transBegin();
        try{
            $op=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$op){
                $db->transRollback();
                return $this->errorResponse(404,'Venda ou pendência não encontrada.');
            }
            if($amount>VendaMoney::cents((string)$op['valor_cobrado'])){
                $db->transRollback();
                return $this->errorResponse(422,'Comissão ajustada não pode superar o valor cobrado do cliente.');
            }
            $before=$op['comissao_ajustada']??$op['comissao_prevista'];
            $adjusted=VendaMoney::decimal($amount);
            $db->table('venda_operacoes')->where('id',(int)$id)->update([
                'comissao_ajustada'=>$adjusted,'ajuste_motivo'=>$reason,
                'atualizado_em'=>$this->nowLocal(),
            ]);
            $db->table('venda_comissao_ajustes')->insert([
                'operacao_id'=>(int)$id,'valor_anterior'=>$before,'valor_novo'=>$adjusted,
                'justificativa'=>$reason,'usuario_id'=>(int)auth('session')->user()->id,
                'criado_em'=>$this->nowLocal(),
            ]);
            $this->commitOrFail($db);
            return $this->responseOK('Comissão ajustada e registrada no histórico. Nenhum repasse foi realizado.');
        }catch(Throwable $e){
            $db->transRollback();return $this->unexpected($e,'ajustar comissão');
        }
    }

    private function numberExists($db,string $number,string $sigla): bool
    {
        return $db->table('venda_operacoes')->where('numero_titulo',$number)
            ->where('sigla_plano',$sigla)->countAllResults()>0;
    }

    private function participants($db,array $data,?array $visit): array
    {
        $first=$this->optionalId($visit['corretor_pessoa_id']??$data['corretor_pessoa_id']??null);
        $second=$this->optionalId($visit['segundo_corretor_pessoa_id']??$data['segundo_corretor_pessoa_id']??null);
        if(!$first||$second===false || ($second!==null && $first===$second)){
            return ['error'=>'Informe corretor principal e, opcionalmente, outro corretor diferente.'];
        }
        foreach(array_filter([$first,$second]) as $personId){
            $role=$db->table('pessoa_papeis')->where('pessoa_id',$personId)
                ->where('papel','corretor')->countAllResults();
            if(!$role)return ['error'=>'O corretor informado não possui função Corretor cadastrada.'];
        }
        return ['corretor_pessoa_id'=>$first,'segundo_corretor_pessoa_id'=>$second];
    }

    private function balance($db,int $id,array $op): int
    {
        $rows=$db->table('venda_recebimentos')->select('tipo,valor')->where('operacao_id',$id)
            ->get()->getResultArray();
        $total=0;
        foreach($rows as $row){
            $c=VendaMoney::cents((string)$row['valor'],true);
            $total+= $row['tipo']==='ENTRADA' ? $c : -$c;
        }
        return VendaMoney::cents((string)$op['valor_cobrado'])-$total;
    }

    private function updateEstimate($db,int $id,array $op): void
    {
        $rule=json_decode($op['regra_snapshot'],true,512,JSON_THROW_ON_ERROR);
        $rows=$db->table('venda_recebimentos r')
            ->select('r.tipo,r.valor,f.codigo')
            ->join('venda_formas_pagamento f','f.id=r.forma_id')
            ->where('r.operacao_id',$id)->get()->getResultArray();
        $pix=0;
        foreach($rows as $row){
            if($row['codigo']!=='PIX')continue;
            $v=VendaMoney::cents((string)$row['valor']);
            $pix+=$row['tipo']==='ENTRADA'?$v:-$v;
        }
        $estimate=VendaMoney::estimate($rule,
            VendaMoney::cents((string)$op['valor_tabela']),
            max(0,$pix),
            VendaMoney::cents((string)$op['desconto_corretor'],true)
        );
        $db->table('venda_operacoes')->where('id',$id)->update([
            'comissao_prevista'=>$estimate['valor'],
            'observacao_comissao'=>$estimate['aviso'],
            'atualizado_em'=>$this->nowLocal(),
        ]);
    }

    private function number(mixed $raw): ?string
    {
        return is_string($raw)&&preg_match('/^\d{4}$/D',$raw)?$raw:null;
    }

    private function expiry(string $date,int $months): string
    {
        $base=new \DateTimeImmutable($date.' 12:00:00');
        $first=$base->modify('first day of this month')->modify('+'.$months.' months');
        $last=(int)$first->format('t');
        $day=min((int)$base->format('d'),$last);
        return $first->setDate((int)$first->format('Y'),(int)$first->format('m'),$day)->format('Y-m-d');
    }

    private function nowLocal(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }
}
