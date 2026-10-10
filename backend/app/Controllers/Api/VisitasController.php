<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Libraries\ClienteRules;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Visitas comerciais sem lançamentos financeiros:
 * chegada -> atendimento -> retorno, sem venda ou pendência de negociação.
 * A comissão e o recebimento ficam para os módulos de venda/pendência.
 */
class VisitasController extends CommercialBaseController
{
    private const FINAL_STATES=['RETORNO','SEM_VENDA','PENDENCIA','VENDA'];

    public function index(): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;

        $dayStart=$this->request->getGet('inicio');
        $dayEnd=$this->request->getGet('fim');
        if ($dayStart!==null && !$this->validateDate($dayStart))return $this->errorResponse(422,'Data inicial inválida.');
        if ($dayEnd!==null && !$this->validateDate($dayEnd))return $this->errorResponse(422,'Data final inválida.');
        if ($dayStart && $dayEnd && $dayEnd<$dayStart) return $this->errorResponse(422,'Período inválido.');
        $filterStatus=(string)($this->request->getGet('status')??'');
        if($filterStatus!=='' && !in_array($filterStatus,['AGUARDANDO','ATENDENDO',...self::FINAL_STATES],true)){
            return $this->errorResponse(422,'Status inválido.');
        }
        $db=db_connect();
        $build=static function() use($db,$dayStart,$dayEnd,$filterStatus) {
            $builder=$db->table('visitas v');
            if($dayStart) $builder->where('v.chegada_em >=',$dayStart.' 00:00:00');
            if($dayEnd) $builder->where('v.chegada_em <=',$dayEnd.' 23:59:59');
            if($filterStatus!=='')$builder->where('v.status',$filterStatus);
            return $builder;
        };

        $stats=$build()->select("
            COUNT(*) AS total,
            SUM(CASE WHEN v.status='AGUARDANDO' THEN 1 ELSE 0 END) AS aguardando,
            SUM(CASE WHEN v.status='ATENDENDO' THEN 1 ELSE 0 END) AS atendendo,
            SUM(CASE WHEN v.status='PENDENCIA' THEN 1 ELSE 0 END) AS pendencia,
            SUM(CASE WHEN v.status='VENDA' THEN 1 ELSE 0 END) AS venda,
            SUM(CASE WHEN v.status='RETORNO' THEN 1 ELSE 0 END) AS retorno,
            SUM(CASE WHEN v.status='SEM_VENDA' THEN 1 ELSE 0 END) AS sem_venda,
            AVG((SELECT SUM(TIMESTAMPDIFF(SECOND,s.inicio_em,s.fim_em)) FROM visita_sessoes s WHERE s.visita_id=v.id AND s.fim_em IS NOT NULL)) AS media_segundos,
            MIN((SELECT SUM(TIMESTAMPDIFF(SECOND,s.inicio_em,s.fim_em)) FROM visita_sessoes s WHERE s.visita_id=v.id AND s.fim_em IS NOT NULL)) AS mais_rapido_segundos,
            MAX((SELECT SUM(TIMESTAMPDIFF(SECOND,s.inicio_em,s.fim_em)) FROM visita_sessoes s WHERE s.visita_id=v.id AND s.fim_em IS NOT NULL)) AS mais_demorado_segundos
        ", false)->get()->getRowArray();

        $visits=$build()
            ->select('v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.dono_corrente_pessoa_id, dono.nome AS dono_corrente_nome, p.nome AS atendente_nome, a.nome AS adicional_nome, m.descricao AS motivo_nome, cp.nome AS corretor_nome, scp.nome AS segundo_corretor_nome,
                (SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,s.inicio_em,s.fim_em)),0) FROM visita_sessoes s WHERE s.visita_id=v.id AND s.fim_em IS NOT NULL) AS duracao_segundos', false)
            ->join('clientes c','c.id=v.cliente_id')
            ->join('pessoas dono','dono.id=c.dono_corrente_pessoa_id','left')
            ->join('pessoas p','p.id=v.atendente_pessoa_id','left')
            ->join('pessoas a','a.id=v.atendente_adicional_pessoa_id','left')
            ->join('pessoas cp','cp.id=v.corretor_pessoa_id','left')
            ->join('pessoas scp','scp.id=v.segundo_corretor_pessoa_id','left')
            ->join('motivos_nao_venda m','m.id=v.motivo_nao_venda_id','left')
            ->orderBy('v.id','DESC')->limit(150)->get()->getResultArray();

        foreach($visits as &$visit){
            foreach(['id','cliente_id','atendente_pessoa_id','atendente_adicional_pessoa_id','motivo_nao_venda_id','dono_corrente_pessoa_id','corretor_pessoa_id','segundo_corretor_pessoa_id'] as $key){
                $visit[$key]=$visit[$key]===null?null:(int)$visit[$key];
            }
        }
        unset($visit);
        foreach($visits as &$visit) $visit['duracao_segundos']=(int)$visit['duracao_segundos'];
        unset($visit);
        return $this->response->setJSON([
            'visitas'=>$visits,
            'indicadores'=>[
                'total'=>(int)($stats['total']??0),
                'aguardando'=>(int)($stats['aguardando']??0),
                'atendendo'=>(int)($stats['atendendo']??0),
                'pendencia'=>(int)($stats['pendencia']??0),
                'venda'=>(int)($stats['venda']??0),
                'retorno'=>(int)($stats['retorno']??0),
                'sem_venda'=>(int)($stats['sem_venda']??0),
                'media_segundos'=>isset($stats['media_segundos'])?round((float)$stats['media_segundos']):null,
                'mais_rapido_segundos'=>isset($stats['mais_rapido_segundos'])?(int)$stats['mais_rapido_segundos']:null,
                'mais_demorado_segundos'=>isset($stats['mais_demorado_segundos'])?(int)$stats['mais_demorado_segundos']:null,
            ],
            'limite_lista'=>150,
        ])->setHeader('Cache-Control','no-store');
    }

    public function chegada(): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;
        $payload=$this->jsonPayload();
        $clientId=$this->optionalId($payload['cliente_id']??null);
        if($clientId===false)return $this->errorResponse(422,'Cliente inválido.');
        $brokers=$this->validateBrokers($payload,db_connect());
        if(isset($brokers['error']))return $this->errorResponse(422,$brokers['error']);

        $db=db_connect();
        $db->transBegin();
        try{
            $client=null;
            if($clientId===null){
                $fresh=$payload['novo_cliente']??null;
                if(!is_array($fresh)){
                    $db->transRollback();
                    return $this->errorResponse(422,'Escolha um cliente ou informe os dados da chegada.');
                }
                $clean=ClienteRules::validate($db,[...$fresh,'ativo'=>true]);
                if(isset($clean['error'])){
                    $db->transRollback();
                    return $this->errorResponse(422,$clean['error']);
                }
                $now=$this->nowLocal();
                $db->table('clientes')->insert([
                    ...$clean,'criado_por_usuario_id'=>(int)auth('session')->user()->id,
                    'criado_em'=>$now,
                ]);
                $clientId=(int)$db->insertID();
                if($clientId<1)throw new \RuntimeException('Falha na criação do cliente.');
                $db->table('cliente_corrente_historico')->insert([
                    'cliente_id'=>$clientId,
                    'dono_anterior_pessoa_id'=>null,
                    'dono_novo_pessoa_id'=>$clean['dono_corrente_pessoa_id'],
                    'origem'=>$clean['indicador_cliente_id']?'INDICACAO':'CADASTRO',
                    'usuario_id'=>(int)auth('session')->user()->id,
                    'criado_em'=>$now,
                ]);
            }else{
                $client=$db->query('SELECT id,ativo FROM clientes WHERE id=? FOR UPDATE',[$clientId])->getRowArray();
                if(!$client || !(bool)$client['ativo']){
                    $db->transRollback();
                    return $this->errorResponse(422,'Selecione um cliente ativo.');
                }
            }
            // Serializa as chegadas do mesmo cliente: não permite dois atendimentos simultâneos.
            $client=$db->query('SELECT id FROM clientes WHERE id=? FOR UPDATE',[$clientId])->getRowArray();
            $busy=$db->table('visitas')->where('cliente_id',$clientId)
                ->whereIn('status',['AGUARDANDO','ATENDENDO'])->countAllResults();
            if($busy){
                $db->transRollback();
                return $this->errorResponse(409,'Este cliente já possui uma visita em andamento.');
            }
            $now=$this->nowLocal();
            // Um cliente que voltou no mesmo dia continua a MESMA visita.
            $sameDay=$db->table('visitas')->where('cliente_id',$clientId)
                ->where('chegada_em >=',substr($now,0,10).' 00:00:00')
                ->where('chegada_em <=',substr($now,0,10).' 23:59:59')
                ->orderBy('id','DESC')->get(1)->getRowArray();
            if($sameDay && in_array($sameDay['status'],['SEM_VENDA','RETORNO','PENDENCIA'],true)){
                $this->reopen($db,$sameDay,$now,$brokers);
                $this->commitOrFail($db);
                return $this->responseOK('Visita retomada no mesmo dia, sem duplicação.',200,[
                    'visita_id'=>(int)$sameDay['id'],'cliente_id'=>$clientId,'retomada'=>true,
                ]);
            }
            $last=$db->table('visitas')->select('atendente_pessoa_id,atendente_adicional_pessoa_id')
                ->where('cliente_id',$clientId)->where('atendente_pessoa_id IS NOT NULL',null,false)
                ->orderBy('id','DESC')->get(1)->getRowArray();
            $now=$this->nowLocal();
            $db->table('visitas')->insert([
                'cliente_id'=>$clientId,
                'corretor_pessoa_id'=>$brokers['corretor_pessoa_id'],
                'segundo_corretor_pessoa_id'=>$brokers['segundo_corretor_pessoa_id'],
                'atendente_pessoa_id'=>$last['atendente_pessoa_id']??null,
                'atendente_adicional_pessoa_id'=>$last['atendente_adicional_pessoa_id']??null,
                'status'=>'AGUARDANDO',
                'chegada_em'=>$now,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
            ]);
            $id=(int)$db->insertID();
            $this->logStatus($db,$id,null,'AGUARDANDO',$now);
            $this->commitOrFail($db);
            return $this->responseOK('Chegada registrada. Horário marcado automaticamente.',201,[
                'visita_id'=>$id,'cliente_id'=>$clientId,
            ]);
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'registrar chegada');
        }
    }

    public function iniciar(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;
        $data=$this->jsonPayload();
        $primary=$this->optionalId($data['atendente_pessoa_id']??null);
        $secondary=$this->optionalId($data['atendente_adicional_pessoa_id']??null);
        if(!$primary || $secondary===false || ($secondary!==null && $primary===$secondary)) {
            return $this->errorResponse(422,'Escolha um atendente principal e, opcionalmente, outro diferente.');
        }
        $db=db_connect();
        $db->transBegin();
        try{
            $visit=$db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$visit){
                $db->transRollback();
                return $this->errorResponse(404,'Visita não encontrada.');
            }
            if($visit['status']!=='AGUARDANDO'){
                $db->transRollback();
                return $this->errorResponse(409,'A visita não está aguardando atendimento.');
            }
            $latest=$db->table('visitas')->select('atendente_pessoa_id,atendente_adicional_pessoa_id')
                ->where('cliente_id',$visit['cliente_id'])
                ->where('id !=',(int)$id)
                ->where('atendente_pessoa_id IS NOT NULL',null,false)
                ->orderBy('id','DESC')->get(1)->getRowArray();
            if(($visit['atendente_pessoa_id'] && (int)$visit['atendente_pessoa_id']!==$primary)
                || ($latest && (int)$latest['atendente_pessoa_id']!==$primary)){
                $db->transRollback();
                return $this->errorResponse(409,'Nos retornos, o cliente deve permanecer com o mesmo atendente.');
            }
            foreach(array_filter([$primary,$secondary]) as $personId){
                $person=$db->table('pessoas')->where('id',$personId)->get()->getRowArray();
                $hasRole=$db->table('pessoa_papeis')->where('pessoa_id',$personId)
                    ->whereIn('papel',['vendedor','corretor'])->countAllResults();
                if(!$person || !(bool)$person['ativo'] || !$hasRole){
                    $db->transRollback();
                    return $this->errorResponse(422,'O atendente precisa estar ativo e ter papel Vendedor ou Corretor.');
                }
            }
            $now=$this->nowLocal();
            $db->table('visitas')->where('id',(int)$id)->update([
                'status'=>'ATENDENDO',
                'atendente_pessoa_id'=>$primary,
                'atendente_adicional_pessoa_id'=>$secondary,
                'inicio_em'=>$now,'atualizado_em'=>$now,
            ]);
            $db->table('visita_sessoes')->insert([
                'visita_id'=>(int)$id,'inicio_em'=>$now,'fim_em'=>null,
                'criado_por_usuario_id'=>(int)auth('session')->user()->id,
            ]);
            $this->logStatus($db,(int)$id,'AGUARDANDO','ATENDENDO',$now);
            $this->commitOrFail($db);
            return $this->responseOK('Atendimento iniciado. Cronômetro registrado pelo servidor.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'iniciar atendimento');
        }
    }

    public function finalizar(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;
        $input=$this->jsonPayload();
        $status=(string)($input['status']??'');
        if(!in_array($status,self::FINAL_STATES,true)){
            return $this->errorResponse(422,'Escolha um resultado válido para o atendimento.');
        }
        $reason=$this->optionalId($input['motivo_nao_venda_id']??null);
        if($reason===false)return $this->errorResponse(422,'Motivo inválido.');
        $returnDay=$input['retorno_previsto']??null;
        if($returnDay==='')$returnDay=null;
        if($returnDay!==null && !$this->validateDate($returnDay)){
            return $this->errorResponse(422,'Data prevista para retorno inválida.');
        }
        $notes=$this->cleanText($input['observacoes']??null,3000);
        if($notes===false)return $this->errorResponse(422,'Observações muito longas.');
        if($status==='SEM_VENDA' && !$reason){
            return $this->errorResponse(422,'Informe o motivo pelo qual não houve venda.');
        }
        if($status==='RETORNO' && !$returnDay){
            return $this->errorResponse(422,'Informe a data prevista para o retorno.');
        }
        $db=db_connect();
        $db->transBegin();
        try{
            $visit=$db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$visit){
                $db->transRollback();
                return $this->errorResponse(404,'Visita não encontrada.');
            }
            if($visit['status']!=='ATENDENDO'){
                $db->transRollback();
                return $this->errorResponse(409,'Somente um atendimento iniciado pode ser finalizado.');
            }
            if($reason!==null){
                $found=$db->table('motivos_nao_venda')->where('id',$reason)->get()->getRowArray();
                if(!$found){
                    $db->transRollback();
                    return $this->errorResponse(422,'Motivo não encontrado.');
                }
            }
            $now=$this->nowLocal();
            $db->table('visitas')->where('id',(int)$id)->update([
                'status'=>$status,'fim_em'=>$now,
                'motivo_nao_venda_id'=>$status==='SEM_VENDA'?$reason:null,
                'retorno_previsto'=>$status==='RETORNO'?$returnDay:null,
                'observacoes'=>$notes,'atualizado_em'=>$now,
            ]);
            $db->table('visita_sessoes')->where('visita_id',(int)$id)
                ->where('fim_em IS NULL',null,false)->update(['fim_em'=>$now]);
            $db->table('visita_resultados_historico')->insert([
                'visita_id'=>(int)$id,'resultado'=>$status,
                'motivo_nao_venda_id'=>$status==='SEM_VENDA'?$reason:null,
                'retorno_previsto'=>$status==='RETORNO'?$returnDay:null,
                'observacoes'=>$notes,'criado_em'=>$now,
                'usuario_id'=>(int)auth('session')->user()->id,
            ]);
            $this->logStatus($db,(int)$id,'ATENDENDO',$status,$now);
            $this->commitOrFail($db);
            return $this->responseOK($status==='VENDA'
                ? 'Venda fechada registrada como resultado comercial. Lance o título e os valores no módulo de Vendas quando disponível.'
                : 'Atendimento encerrado e duração registrada.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'finalizar atendimento');
        }
    }

    /**
     * Corretores pertencem à visita, não à corrente e não ao login da operadora.
     * Correções de visitas antigas são auditadas.
     */
    public function corretores(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;
        $db=db_connect();
        $brokers=$this->validateBrokers($this->jsonPayload(),$db);
        if(isset($brokers['error']))return $this->errorResponse(422,$brokers['error']);
        $db->transBegin();
        try{
            $visit=$db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$visit){
                $db->transRollback();
                return $this->errorResponse(404,'Atendimento não encontrado.');
            }
            $this->saveBrokers($db,$visit,$brokers,$this->nowLocal());
            $this->commitOrFail($db);
            return $this->responseOK('Corretores da visita atualizados. Corrente preservada.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'corrigir corretores');
        }
    }

    /**
     * Retoma apenas visitas encerradas no mesmo dia da chegada; não cria outra.
     */
    public function retomar(int|string $id): ResponseInterface
    {
        if ($denied=$this->authorizeOperations()) return $denied;
        $db=db_connect();
        $brokers=$this->validateBrokers($this->jsonPayload(),$db);
        if(isset($brokers['error']))return $this->errorResponse(422,$brokers['error']);
        $db->transBegin();
        try{
            $visit=$db->query('SELECT * FROM visitas WHERE id=? FOR UPDATE',[(int)$id])->getRowArray();
            if(!$visit){
                $db->transRollback();
                return $this->errorResponse(404,'Atendimento não encontrado.');
            }
            $now=$this->nowLocal();
            if(substr($visit['chegada_em'],0,10)!==substr($now,0,10)
                || !in_array($visit['status'],['RETORNO','SEM_VENDA','PENDENCIA'],true)){
                $db->transRollback();
                return $this->errorResponse(409,'Somente visitas encerradas hoje podem ser retomadas.');
            }
            $other=$db->table('visitas')->where('cliente_id',$visit['cliente_id'])
                ->where('id !=',(int)$id)->whereIn('status',['AGUARDANDO','ATENDENDO'])
                ->countAllResults();
            if($other){
                $db->transRollback();
                return $this->errorResponse(409,'Este cliente já possui outro atendimento em andamento.');
            }
            $this->reopen($db,$visit,$now,$brokers);
            $this->commitOrFail($db);
            return $this->responseOK('Mesmo atendimento retomado, mantendo o histórico de resultados.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'retomar visita');
        }
    }

    private function validateBrokers(array $input,$db): array
    {
        $primary=$this->optionalId($input['corretor_pessoa_id']??null);
        $secondary=$this->optionalId($input['segundo_corretor_pessoa_id']??null);
        if(!$primary || $secondary===false || ($secondary!==null && $secondary===$primary)){
            return ['error'=>'Informe o corretor principal e, se houver, um segundo corretor diferente.'];
        }
        foreach(array_filter([$primary,$secondary]) as $id){
            $person=$db->table('pessoas')->where('id',$id)->get()->getRowArray();
            $role=$db->table('pessoa_papeis')->where('pessoa_id',$id)
                ->where('papel','corretor')->countAllResults();
            if(!$person || !(bool)$person['ativo'] || !$role){
                return ['error'=>'Selecione corretores ativos e cadastrados com a função Corretor.'];
            }
        }
        return ['corretor_pessoa_id'=>$primary,'segundo_corretor_pessoa_id'=>$secondary];
    }

    private function saveBrokers($db,array $visit,array $brokerIds,string $now): void
    {
        $before=(int)($visit['corretor_pessoa_id']??0);
        $beforeSecond=(int)($visit['segundo_corretor_pessoa_id']??0);
        $after=(int)$brokerIds['corretor_pessoa_id'];
        $afterSecond=(int)($brokerIds['segundo_corretor_pessoa_id']??0);
        if($before===$after && $beforeSecond===$afterSecond)return;
        $db->table('visitas')->where('id',$visit['id'])->update([
            ...$brokerIds,'atualizado_em'=>$now,
        ]);
        $db->table('visita_corretor_historico')->insert([
            'visita_id'=>$visit['id'],
            'anterior_corretor_id'=>$before?:null,
            'novo_corretor_id'=>$after,
            'anterior_segundo_id'=>$beforeSecond?:null,
            'novo_segundo_id'=>$afterSecond?:null,
            'usuario_id'=>(int)auth('session')->user()->id,
            'criado_em'=>$now,
        ]);
    }

    private function reopen($db,array $visit,string $now,array $brokerIds): void
    {
        // Primeira chegada e atendente permanecem; minutos já trabalhados ficam
        // em visita_sessoes, impedindo somar o intervalo em que cliente saiu.
        $this->saveBrokers($db,$visit,$brokerIds,$now);
        $db->table('visitas')->where('id',$visit['id'])->update([
            'status'=>'AGUARDANDO',
            'fim_em'=>null,
            'retorno_previsto'=>null,
            'motivo_nao_venda_id'=>null,
            'atualizado_em'=>$now,
        ]);
        $this->logStatus($db,(int)$visit['id'],$visit['status'],'AGUARDANDO',$now);
    }

    private function logStatus($db,int $id,?string $before,string $after,string $now): void
    {
        $db->table('visita_status_historico')->insert([
            'visita_id'=>$id,'status_anterior'=>$before,'status_novo'=>$after,
            'usuario_id'=>(int)auth('session')->user()->id,'criado_em'=>$now,
        ]);
    }

    private function nowLocal(): string
    {
        return \CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateTimeString();
    }
}
