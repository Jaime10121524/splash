<?php

declare(strict_types=1);

namespace App\Commands;

use App\Libraries\GestaoEquipe;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Reconcilia exclusivamente vendas já cadastradas entre duas correntes,
 * sem tocar em pagamentos, rateios ou movimentos financeiros.
 * Primeiro roda em modo consulta; aplicar exige ID explícito da venda.
 * Titularidade é atualizada somente se a venda é a última do cliente.
 */
final class RevisarRenovacoesSplash extends BaseCommand
{
    protected $group='SPLASH - Comercial';
    protected $name='splash:revisar-renovacoes';
    protected $description='Analisa e opcionalmente sinaliza renovação externa em vendas antigas de duas correntes.';

    public function run(array $params)
    {
        $apply=isset($params[0]) && $params[0]==='aplicar';
        $one=isset($params[1]) && ctype_digit((string)$params[1])
            && (int)$params[1]>0?(int)$params[1]:null;
        if($apply && $one===null){
            CLI::error('Informe o ID exato: php spark splash:revisar-renovacoes aplicar 123');
            return;
        }
        if(isset($params[0]) && !in_array($params[0],['aplicar','consultar'],true)){
            CLI::error('Use: php spark splash:revisar-renovacoes [consultar|aplicar]');
            return;
        }
        $db=db_connect();
        if(!$db->tableExists('venda_operacoes')){
            CLI::error('Não há tabela de vendas neste banco.');return;
        }
        $candidate=$db->table('venda_operacoes')
            ->select('id,cliente_id,visita_id,corretor_pessoa_id,segundo_corretor_pessoa_id,renovacao_externa,criado_por_usuario_id')
            ->where('situacao','VENDA')->where('renovacao_externa',0)
            ->where('segundo_corretor_pessoa_id IS NOT NULL',null,false);
        if($one!==null)$candidate->where('id',$one);
        $candidates=$candidate->orderBy('id','DESC')->limit(1000)->get()->getResultArray();
        $found=[];
        foreach($candidates as $op){
            $main=(int)$op['corretor_pessoa_id'];
            $second=(int)$op['segundo_corretor_pessoa_id'];
            if($main===0||$second===0||$main===$second)continue;
            $visit=$op['visita_id']?
                $db->table('visitas')->where('id',(int)$op['visita_id'])->get()->getRowArray():null;
            if(!GestaoEquipe::renovacaoExterna($db,(int)$op['cliente_id'],$main,$visit,$second,(int)$op['id']))continue;
            $found[]=['id'=>(int)$op['id'],'main'=>$main,'second'=>$second];
            CLI::write('Possível renovação externa: venda #'.$op['id'].
                ' · titular '.$main.' · segundo corretor '.$second,'yellow');
        }
        CLI::write('Identificadas '.count($found).' venda(s) para revisão.','cyan');
        if(!$apply){
            CLI::write('Somente consulta. Para atualizar UMA venda, execute: php spark splash:revisar-renovacoes aplicar ID_DA_VENDA','yellow');
            return;
        }
        if(!$db->tableExists('venda_operacoes_auditoria')){
            CLI::error('Auditoria de vendas indisponível. Execute as migrations.');return;
        }
        $done=0;
        foreach($found as $item){
            $db->transBegin();
            try{
                $current=$db->query('SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE',[$item['id']])->getRowArray();
                if(!$current||(bool)$current['renovacao_externa']){$db->transRollback();continue;}
                $old=[
                    'renovacao_externa'=>(int)$current['renovacao_externa'],
                    'dono_corrente_pessoa_id'=>(int)($current['dono_corrente_pessoa_id']??0),
                    'responsavel_financeiro_pessoa_id'=>$current['responsavel_financeiro_pessoa_id'],
                ];
                $new=[
                    'renovacao_externa'=>1,
                    'dono_corrente_pessoa_id'=>$item['main'],
                    'responsavel_financeiro_pessoa_id'=>$item['second'],
                    'atualizado_em'=>date('Y-m-d H:i:s'),
                ];
                $db->table('venda_operacoes')->where('id',$item['id'])->update($new);
                // Só alterar a corrente ATUAL do cliente quando não houver
                // uma venda posterior, e o dono ainda for o registrado nessa
                // operação. Não reescrever histórico de terceiros.
                $later=$db->table('venda_operacoes')->where('cliente_id',(int)$current['cliente_id'])
                    ->where('id >',(int)$current['id'])->countAllResults()>0;
                $owner=$db->table('clientes')->select('dono_corrente_pessoa_id')
                    ->where('id',(int)$current['cliente_id'])->get()->getRowArray();
                if(!$later && $owner
                    && (int)$owner['dono_corrente_pessoa_id']===(int)$old['dono_corrente_pessoa_id']
                    && (int)$owner['dono_corrente_pessoa_id']!==$item['main']){
                    GestaoEquipe::atribuirCorrente($db,(int)$current['cliente_id'],
                        $item['main'],(int)$current['criado_por_usuario_id'],
                        'Correção auditada da corrente em renovação de corretor externo.');
                }
                $db->table('venda_operacoes_auditoria')->insert([
                    'operacao_id'=>$item['id'],'acao'=>'RECLASSIFICAR_RENOVACAO',
                    'dados_antes'=>json_encode($old,JSON_THROW_ON_ERROR),
                    'dados_depois'=>json_encode($new,JSON_THROW_ON_ERROR),
                    'justificativa'=>'Correção do indicador de renovação de corretor externo; sem alteração de rateios ou pagamentos.',
                    'usuario_id'=>(int)$current['criado_por_usuario_id'],
                    'criado_em'=>date('Y-m-d H:i:s'),
                ]);
                if($db->transStatus()===false)throw new \RuntimeException('Transação não validada.');
                $db->transCommit();$done++;
            }catch(\Throwable $e){
                $db->transRollback();
                CLI::error('Venda #'.$item['id'].': '.$e->getMessage());
            }
        }
        CLI::write('Reclassificadas: '.$done.'. Responsável financeiro e corrente da venda atualizados; sem recálculo de comissões nem edição dos pagamentos.','green');
    }
}
