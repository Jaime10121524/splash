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
    private const FINAL_STATES=['RETORNO','SEM_VENDA','PENDENCIA'];

    public function index(): ResponseInterface
    {
        if ($denied=$this->authorizeAdmin()) return $denied;

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
            SUM(CASE WHEN v.status='RETORNO' THEN 1 ELSE 0 END) AS retorno,
            SUM(CASE WHEN v.status='SEM_VENDA' THEN 1 ELSE 0 END) AS sem_venda,
            AVG(TIMESTAMPDIFF(SECOND,v.inicio_em,v.fim_em)) AS media_segundos,
            MIN(TIMESTAMPDIFF(SECOND,v.inicio_em,v.fim_em)) AS mais_rapido_segundos,
            MAX(TIMESTAMPDIFF(SECOND,v.inicio_em,v.fim_em)) AS mais_demorado_segundos
        ", false)->get()->getRowArray();

        $visits=$build()
            ->select('v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.dono_corrente_pessoa_id, dono.nome AS dono_corrente_nome, p.nome AS atendente_nome, a.nome AS adicional_nome, m.descricao AS motivo_nome')
            ->join('clientes c','c.id=v.cliente_id')
            ->join('pessoas dono','dono.id=c.dono_corrente_pessoa_id','left')
            ->join('pessoas p','p.id=v.atendente_pessoa_id','left')
            ->join('pessoas a','a.id=v.atendente_adicional_pessoa_id','left')
            ->join('motivos_nao_venda m','m.id=v.motivo_nao_venda_id','left')
            ->orderBy('v.id','DESC')->limit(150)->get()->getResultArray();

        foreach($visits as &$visit){
            foreach(['id','cliente_id','atendente_pessoa_id','atendente_adicional_pessoa_id','motivo_nao_venda_id','dono_corrente_pessoa_id'] as $key){
                $visit[$key]=$visit[$key]===null?null:(int)$visit[$key];
            }
        }
        unset($visit);
        return $this->response->setJSON([
            'visitas'=>$visits,
            'indicadores'=>[
                'total'=>(int)($stats['total']??0),
                'aguardando'=>(int)($stats['aguardando']??0),
                'atendendo'=>(int)($stats['atendendo']??0),
                'pendencia'=>(int)($stats['pendencia']??0),
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
        if ($denied=$this->authorizeAdmin()) return $denied;
        $payload=$this->jsonPayload();
        $clientId=$this->optionalId($payload['cliente_id']??null);
        if($clientId===false)return $this->errorResponse(422,'Cliente inválido.');

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
            $last=$db->table('visitas')->select('atendente_pessoa_id,atendente_adicional_pessoa_id')
                ->where('cliente_id',$clientId)->where('atendente_pessoa_id IS NOT NULL',null,false)
                ->orderBy('id','DESC')->get(1)->getRowArray();
            $now=$this->nowLocal();
            $db->table('visitas')->insert([
                'cliente_id'=>$clientId,
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
        if ($denied=$this->authorizeAdmin()) return $denied;
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
            if($latest && (int)$latest['atendente_pessoa_id']!==$primary){
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
        if ($denied=$this->authorizeAdmin()) return $denied;
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
            $this->logStatus($db,(int)$id,'ATENDENDO',$status,$now);
            $this->commitOrFail($db);
            return $this->responseOK('Atendimento encerrado e duração registrada.');
        }catch(Throwable $e){
            $db->transRollback();
            return $this->unexpected($e,'finalizar atendimento');
        }
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
