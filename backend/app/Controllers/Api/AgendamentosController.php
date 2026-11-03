<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\ClienteRules;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/**
 * Agenda de visita compartilhada entre SPA (sessão + CSRF) e app (Shield mobile).
 * QR é uma chave de pesquisa opaca; nunca substitui o login.
 */
final class AgendamentosController extends BaseController
{
    private function user()
    {
        $header = $this->request->getHeaderLine('Authorization');
        return str_starts_with(strtolower($header), 'bearer ')
            ? auth('tokens')->user() : auth('session')->user();
    }

    private function deny(int $code, string $message): ResponseInterface
    {
        return $this->response->setStatusCode($code)->setJSON(['message'=>$message])
            ->setHeader('Cache-Control','no-store');
    }

    private function check(): array|ResponseInterface
    {
        $user = $this->user();
        if (!$user || $user->isBanned()) return $this->deny(401, 'Entre novamente para acessar agendamentos.');
        if (!$user->inGroup('admin','gerente','corretor','operador')) {
            return $this->deny(403,'Seu perfil não tem acesso a agendamentos.');
        }
        $restricted = $user->inGroup('corretor') && !$user->inGroup('admin','gerente','operador');
        $personId=null;
        if ($restricted) {
            $person = db_connect()->table('pessoas')->select('id')
                ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
            if (!$person) return $this->deny(403,'Seu usuário não possui corretor ativo vinculado.');
            $personId=(int)$person['id'];
        }
        return ['user'=>$user,'scope'=>$personId];
    }

    private function parseId($value): ?int
    {
        if (!is_string($value) && !is_int($value)) return null;
        $id=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        return $id===false ? null : (int)$id;
    }

    private function validDate(string $date): bool
    {
        $d=\DateTimeImmutable::createFromFormat('!Y-m-d',$date);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date) && $d
            && $d->format('Y-m-d')===$date && (int)$d->format('Y')>=2000;
    }

    private function personRole($db,int $personId,array $roles): bool
    {
        return $db->table('pessoas p')->join('pessoa_papeis pp','pp.pessoa_id=p.id')
            ->where('p.id',$personId)->where('p.ativo',1)
            ->whereIn('pp.papel',$roles)->countAllResults()>0;
    }

    private function visible(array $row,array $actor): bool
    {
        return $actor['scope']===null || (int)$row['captador_pessoa_id']===$actor['scope']
            || (int)($row['corretor_confirmado_pessoa_id']??0)===$actor['scope']
            || (int)($row['segundo_corretor_pessoa_id']??0)===$actor['scope'];
    }

    private function dbError(Throwable $e,string $action,$db=null): ResponseInterface
    {
        if ($db !== null) $db->transRollback();
        log_message('error','Agendamentos {action}: {error}', [
            'action'=>$action,'error'=>$e->getMessage(),
        ]);
        return $this->deny(500,'Não foi possível concluir a operação. Verifique o log do servidor.');
    }

    private function output(array $row): array
    {
        foreach (['id','quantidade_pessoas','captador_pessoa_id','corretor_confirmado_pessoa_id',
            'segundo_corretor_pessoa_id','atendente_pessoa_id','cliente_id','visita_id'] as $field) {
            if (array_key_exists($field,$row)) {
                $row[$field]=$row[$field]===null?null:(int)$row[$field];
            }
        }
        return $row;
    }

    private function rows($db): \CodeIgniter\Database\BaseBuilder
    {
        return $db->table('agendamentos a')
            ->select('a.*,p.nome AS captador_nome,c.nome AS corretor_confirmado_nome,
                s.nome AS segundo_corretor_nome,t.nome AS atendente_nome,
                COALESCE(op.situacao,v.status) AS visita_status')
            ->join('venda_operacoes op','op.visita_id=a.visita_id','left')
            ->join('pessoas p','p.id=a.captador_pessoa_id')
            ->join('pessoas c','c.id=a.corretor_confirmado_pessoa_id','left')
            ->join('pessoas s','s.id=a.segundo_corretor_pessoa_id','left')
            ->join('pessoas t','t.id=a.atendente_pessoa_id','left')
            ->join('visitas v','v.id=a.visita_id','left');
    }

    public function index(): ResponseInterface
    {
        $actor=$this->check();
        if ($actor instanceof ResponseInterface) return $actor;
        $db=db_connect();
        if (!$db->tableExists('agendamentos')) {
            return $this->deny(503, 'Agendamentos ainda não está instalado neste banco. Faça backup e execute as migrações pendentes.');
        }
        $search=trim((string)($this->request->getGet('q')??''));
        if (mb_strlen($search)>100) return $this->deny(422,'Pesquisa muito longa.');
        $periodStart=trim((string)($this->request->getGet('inicio')??''));
        $periodEnd=trim((string)($this->request->getGet('fim')??''));
        if (($periodStart!=='' && !$this->validDate($periodStart))
            || ($periodEnd!=='' && !$this->validDate($periodEnd))
            || ($periodStart!=='' && $periodEnd!=='' && $periodStart>$periodEnd)) {
            return $this->deny(422, 'Informe um período válido para consultar os agendamentos.');
        }
        // Indicadores são agregados sobre TODO o filtro, não apenas os 150
        // registros renderizados. A operação vinculada tem prioridade sobre
        // o status histórico da visita.
        $builder=$this->rows($db);
        $statsBuilder=$db->table('agendamentos a')
            ->select("
                SUM(CASE WHEN a.situacao <> 'CANCELADO' THEN 1 ELSE 0 END) AS agendados,
                SUM(CASE WHEN a.situacao = 'COMPARECEU' THEN 1 ELSE 0 END) AS compareceram,
                SUM(CASE WHEN a.situacao = 'AGENDADO'
                    AND a.data_visita < CURDATE() THEN 1 ELSE 0 END) AS nao_compareceram,
                SUM(CASE WHEN a.situacao = 'COMPARECEU'
                    AND (v.status = 'VENDA' OR op.situacao = 'VENDA') THEN 1 ELSE 0 END) AS vendas,
                SUM(CASE WHEN a.situacao = 'CANCELADO' THEN 1 ELSE 0 END) AS cancelados
            ",false)
            ->join('visitas v','v.id=a.visita_id','left')
            ->join('venda_operacoes op','op.visita_id=a.visita_id','left');
        foreach ([$builder,$statsBuilder] as $query) {
            if ($actor['scope']!==null) {
                $query->groupStart()
                    ->where('a.captador_pessoa_id',$actor['scope'])
                    ->orWhere('a.corretor_confirmado_pessoa_id',$actor['scope'])
                    ->orWhere('a.segundo_corretor_pessoa_id',$actor['scope'])
                    ->groupEnd();
            }
            if ($search!=='') {
                $digits=preg_replace('/\D/','',$search);
                $query->groupStart()->like('a.nome_completo',$search);
                if(strlen($digits)>=3) $query->orLike('a.telefone',$digits);
                if(ctype_digit($search)) $query->orWhere('a.id',(int)$search);
                $query->groupEnd();
            }
            if ($periodStart) $query->where('a.data_visita >=',$periodStart);
            if ($periodEnd) $query->where('a.data_visita <=',$periodEnd);
        }
        $total=$builder->countAllResults(false);
        $rows=$builder->orderBy('a.data_visita','DESC')->orderBy('a.id','DESC')
            ->limit(150)->get()->getResultArray();
        foreach ($rows as &$row) $row=$this->output($row);
        unset($row);
        $sums=$statsBuilder->get()->getRowArray()?:[];
        $stats=[];
        foreach (['agendados','compareceram','nao_compareceram','vendas','cancelados'] as $field) {
            $stats[$field]=(int)($sums[$field]??0);
        }
        $stats['taxa_comparecimento']=$stats['agendados']>0
            ? round(100*$stats['compareceram']/$stats['agendados'],1):0;
        $stats['taxa_fechamento']=$stats['compareceram']>0
            ? round(100*$stats['vendas']/$stats['compareceram'],1):0;
        return $this->response->setJSON([
            'agendamentos'=>$rows,'total'=>(int)$total,
            'indicadores'=>$stats,'limite_lista'=>150,
        ])->setHeader('Cache-Control','no-store');
    }

    public function create(): ResponseInterface
    {
        $actor=$this->check();
        if ($actor instanceof ResponseInterface) return $actor;
        $data=$this->request->getJSON(true);
        if (!is_array($data)) return $this->deny(422,'Informe os dados do agendamento.');
        $name=trim((string)($data['nome_completo']??''));
        $phone=preg_replace('/\D/','',(string)($data['telefone']??''));
        if (str_starts_with($phone,'55') && in_array(strlen($phone),[12,13],true)) $phone=substr($phone,2);
        $date=(string)($data['data_visita']??'');
        $amount=$this->parseId($data['quantidade_pessoas']??null);
        $captor=$actor['scope']??$this->parseId($data['captador_pessoa_id']??null);
        $notes=trim((string)($data['observacoes']??''));
        if ($name==='' || mb_strlen($name)>160 || !in_array(strlen($phone),[10,11],true)
            || !$this->validDate($date) || $date<date('Y-m-d')
            || $amount===null || $amount>100 || $captor===null || mb_strlen($notes)>500) {
            return $this->deny(422,'Informe nome, telefone com DDD, data futura ou de hoje, 1 a 100 pessoas e corretor.');
        }
        $db=db_connect();
        if (!$this->personRole($db,$captor,['corretor'])) {
            return $this->deny(422,'O corretor do agendamento precisa estar ativo.');
        }
        $token=bin2hex(random_bytes(32));
        $now=date('Y-m-d H:i:s');
        try {
            $db->table('agendamentos')->insert([
                'nome_completo'=>$name,'telefone'=>$phone,'data_visita'=>$date,
                'quantidade_pessoas'=>$amount,'captador_pessoa_id'=>$captor,
                'qr_token'=>$token,'situacao'=>'AGENDADO',
                'observacoes'=>$notes?:null,'criado_por_usuario_id'=>(int)$actor['user']->id,
                'criado_em'=>$now,
            ]);
            $id=(int)$db->insertID();
            if ($id<1) throw new \RuntimeException('Falha ao criar agendamento.');
            return $this->response->setStatusCode(201)->setJSON([
                'message'=>'Agendamento criado. Compartilhe o cartão com QR Code.',
                'agendamento_id'=>$id,'qr_payload'=>'SPLASH:AG:1:'.$token,
            ])->setHeader('Cache-Control','no-store');
        } catch(Throwable $e) { return $this->dbError($e,'cadastrar'); }
    }

    public function validateQr(): ResponseInterface
    {
        $actor=$this->check();
        if ($actor instanceof ResponseInterface) return $actor;
        $data=$this->request->getJSON(true);
        $payload=is_array($data)?(string)($data['qr']??''):'';
        if (!preg_match('/^SPLASH:AG:1:([a-f0-9]{64})$/D',$payload,$match)) {
            return $this->deny(422,'Esse QR Code não pertence ao Splash ou está inválido.');
        }
        $db=db_connect();
        $row=$this->rows($db)->where('a.qr_token',$match[1])->get()->getRowArray();
        if (!$row || !$this->visible($row,$actor)) {
            return $this->deny(404,'Agendamento não encontrado para este perfil.');
        }
        return $this->response->setJSON(['agendamento'=>$this->output($row)])
            ->setHeader('Cache-Control','no-store');
    }

    public function checkin(int|string $id): ResponseInterface
    {
        $actor=$this->check();
        if ($actor instanceof ResponseInterface) return $actor;
        $bookingId=$this->parseId($id);
        $data=$this->request->getJSON(true);
        if ($bookingId===null || !is_array($data)) return $this->deny(422,'Informe a visita do agendamento.');
        // Chegada simples não exige escolher atendente nem alterar corretor.
        // Se não houver corretor enviado, preserva o captador original do QR.
        $brokerProvided=($data['corretor_pessoa_id']??null)!==null;
        $broker=$brokerProvided?$this->parseId($data['corretor_pessoa_id']):null;
        $second=($data['segundo_corretor_pessoa_id']??null)===null ? null
            : $this->parseId($data['segundo_corretor_pessoa_id']);
        $attendantProvided=($data['atendente_pessoa_id']??null)!==null;
        $attendant=$attendantProvided?$this->parseId($data['atendente_pessoa_id']):null;
        $clientChosen=($data['cliente_id']??null)===null?null:$this->parseId($data['cliente_id']);
        if (($brokerProvided && $broker===null)
            || ($second!==null && $broker!==null && $broker===$second)
            || (($data['segundo_corretor_pessoa_id']??null)!==null && $second===null)
            || ($attendantProvided && $attendant===null)
            || (($data['cliente_id']??null)!==null && $clientChosen===null)) {
            return $this->deny(422,'Confira os participantes e o cadastro do cliente.');
        }

        $db=db_connect();
        $db->transBegin();
        try {
            $book=$db->query('SELECT * FROM agendamentos WHERE id=? FOR UPDATE',[$bookingId])->getRowArray();
            if (!$book || !$this->visible($book,$actor)) {
                $db->transRollback();return $this->deny(404,'Agendamento não encontrado.');
            }
            $broker=$broker??(int)$book['captador_pessoa_id'];
            if ($broker===$second
                || !$this->personRole($db,$broker,['corretor'])
                || ($second!==null && !$this->personRole($db,$second,['corretor']))
                || ($attendant!==null && !$this->personRole($db,$attendant,['vendedor','corretor']))) {
                $db->transRollback();return $this->deny(422,'Escolha corretores e atendente ativos.');
            }
            if ($actor['scope']!==null && $broker!==$actor['scope'] && $second!==$actor['scope']) {
                $db->transRollback();return $this->deny(403,'Um dos corretores precisa ser o seu perfil.');
            }
            if ($book['situacao']!=='AGENDADO' || $book['visita_id']!==null) {
                $db->transRollback();return $this->deny(409,'Este QR Code já foi utilizado ou o agendamento foi cancelado.');
            }
            // O voucher só autoriza chegada na data agendada, nunca em outro dia.
            $today=\CodeIgniter\I18n\Time::now(config('App')->appTimezone)->toDateString();
            if ($book['data_visita']!==$today) {
                $db->transRollback();return $this->deny(409,'Voucher válido somente na data agendada.');
            }
            $qr=(string)($data['qr']??'');
            if (!hash_equals('SPLASH:AG:1:'.$book['qr_token'],$qr)) {
                $db->transRollback();return $this->deny(403,'O QR Code apresentado não corresponde a este agendamento.');
            }
            // Agendamento não transfere automaticamente a corrente. O captador
            // permanece no histórico e como dono da corrente no primeiro cadastro.
            $clientId=$clientChosen;
            if ($clientId!==null) {
                $client=$db->table('clientes')->where('id',$clientId)->where('ativo',1)->get()->getRowArray();
                if (!$client || ($actor['scope']!==null
                    && (int)$client['dono_corrente_pessoa_id']!==$actor['scope'])) {
                    $db->transRollback();return $this->deny(403,'Cliente informado não está acessível para este usuário.');
                }
            } else {
                // Reutilizar somente um cadastro inequivocamente idêntico; nunca
                // unir pessoas diferentes apenas porque compartilham um telefone.
                $matches=$db->table('clientes')->select('id,nome,dono_corrente_pessoa_id')
                    ->where('telefone',$book['telefone'])->get()->getResultArray();
                if ($matches) {
                    $exact=array_values(array_filter($matches,static fn($row)=>
                        mb_strtolower(trim($row['nome']))===mb_strtolower(trim($book['nome_completo']))));
                    if (count($matches)!==1 || count($exact)!==1
                        || ($actor['scope']!==null
                            && (int)$exact[0]['dono_corrente_pessoa_id']!==$actor['scope'])) {
                        $db->transRollback();return $this->deny(409,
                            'Já existe cliente com esse telefone. Selecione o cadastro correto antes de confirmar.');
                    }
                    $clientId=(int)$exact[0]['id'];
                } else {
                    $origin=$db->table('lead_origens')->where('nome','Agendamento')->get()->getRowArray();
                    if (!$origin) throw new \RuntimeException('Origem Agendamento não cadastrada.');
                    $clean=ClienteRules::validate($db,[
                        'nome'=>$book['nome_completo'],'telefone'=>$book['telefone'],
                        'origem_id'=>(int)$origin['id'],
                        'dono_corrente_pessoa_id'=>(int)$book['captador_pessoa_id'],
                        'ativo'=>true,
                    ]);
                    if (isset($clean['error'])) {
                        $db->transRollback();return $this->deny(422,$clean['error']);
                    }
                    $db->table('clientes')->insert([
                        ...$clean,'criado_por_usuario_id'=>(int)$actor['user']->id,
                        'criado_em'=>date('Y-m-d H:i:s'),
                    ]);
                    $clientId=(int)$db->insertID();
                    if ($clientId<1) throw new \RuntimeException('Falha na criação do cliente.');
                    $db->table('cliente_corrente_historico')->insert([
                        'cliente_id'=>$clientId,'dono_anterior_pessoa_id'=>null,
                        'dono_novo_pessoa_id'=>(int)$clean['dono_corrente_pessoa_id'],
                        'origem'=>'CADASTRO','usuario_id'=>(int)$actor['user']->id,
                        'criado_em'=>date('Y-m-d H:i:s'),
                    ]);
                }
            }

            if ($db->table('visitas')->where('cliente_id',$clientId)
                ->whereIn('status',['AGUARDANDO','ATENDENDO'])->countAllResults()) {
                $db->transRollback();
                return $this->deny(409,'O cliente já possui uma visita em andamento.');
            }
            $now=date('Y-m-d H:i:s');
            $db->table('visitas')->insert([
                'cliente_id'=>$clientId,'corretor_pessoa_id'=>$broker,
                'segundo_corretor_pessoa_id'=>$second,
                'atendente_pessoa_id'=>$attendant,
                'status'=>'AGUARDANDO','chegada_em'=>$now,
                'criado_por_usuario_id'=>(int)$actor['user']->id,
            ]);
            $visitId=(int)$db->insertID();
            if ($visitId<1) throw new \RuntimeException('Falha ao iniciar visita.');
            // Check-in marca somente a chegada. Sessão e início são criados
            // exclusivamente pelo endpoint /atendimentos/{id}/iniciar.
            $db->table('visita_status_historico')->insert([
                'visita_id'=>$visitId,'status_anterior'=>null,
                'status_novo'=>'AGUARDANDO',
                'usuario_id'=>(int)$actor['user']->id,'criado_em'=>$now,
            ]);
            $db->table('agendamentos')->where('id',$bookingId)->update([
                'situacao'=>'COMPARECEU','compareceu_em'=>$now,
                'cliente_id'=>$clientId,'visita_id'=>$visitId,
                'corretor_confirmado_pessoa_id'=>$broker,
                'segundo_corretor_pessoa_id'=>$second,
                'atendente_pessoa_id'=>$attendant,
                'recebido_por_usuario_id'=>(int)$actor['user']->id,'atualizado_em'=>$now,
            ]);
            if ($db->transStatus()===false) throw new \RuntimeException('Falha no check-in.');
            $db->transCommit();
            try { \App\Libraries\VisitasAvisos::registrar($visitId,'CHEGADA'); }
            catch(Throwable $ignored) { log_message('warning','Aviso check-in não enviado: '.$ignored->getMessage()); }
            return $this->response->setJSON([
                'message'=>'Chegada registrada. A visita está aguardando o início do atendimento.',
                'agendamento_id'=>$bookingId,'visita_id'=>$visitId,
                'cliente_id'=>$clientId,
            ])->setHeader('Cache-Control','no-store');
        } catch(Throwable $e) { return $this->dbError($e,'check-in',$db); }
    }

    public function cancel(int|string $id): ResponseInterface
    {
        $actor=$this->check();
        if ($actor instanceof ResponseInterface) return $actor;
        $bookingId=$this->parseId($id);
        if (!$bookingId) return $this->deny(404,'Agendamento não encontrado.');
        $db=db_connect();
        $db->transBegin();
        try {
            $row=$db->query('SELECT * FROM agendamentos WHERE id=? FOR UPDATE',[$bookingId])->getRowArray();
            if (!$row || !$this->visible($row,$actor)) {
                $db->transRollback();return $this->deny(404,'Agendamento não encontrado.');
            }
            if ($row['situacao']!=='AGENDADO') {
                $db->transRollback();return $this->deny(409,'Somente agendamentos pendentes podem ser cancelados.');
            }
            $db->table('agendamentos')->where('id',$bookingId)->update([
                'situacao'=>'CANCELADO','cancelado_em'=>date('Y-m-d H:i:s'),
                'atualizado_em'=>date('Y-m-d H:i:s'),
            ]);
            if ($db->transStatus()===false) throw new \RuntimeException('Falha no cancelamento.');
            $db->transCommit();
            return $this->response->setJSON(['message'=>'Agendamento cancelado.'])
                ->setHeader('Cache-Control','no-store');
        } catch(Throwable $e) { return $this->dbError($e,'cancelar',$db); }
    }
}
