<?php

declare(strict_types=1);

namespace App\Commands;

use App\Libraries\GestaoEquipe;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Reconcilia exclusivamente vendas já cadastradas entre duas correntes,
 * sem tocar em pagamentos, rateios, titularidade ou movimentação financeira.
 * Primeiro roda em modo consulta; executar "aplicar" só após conferir os IDs.
 */
final class RevisarRenovacoesSplash extends BaseCommand
{
    protected $group='SPLASH - Comercial';
    protected $name='splash:revisar-renovacoes';
    protected $description='Analisa e opcionalmente sinaliza renovação externa em vendas antigas de duas correntes.';

    public function run(array $params)
    {
        $apply=isset($params[0]) && $params[0]==='aplicar';
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
            ->where('visita_id IS NOT NULL',null,false)
            ->where('segundo_corretor_pessoa_id IS NOT NULL',null,false)
            ->orderBy('id','DESC')->limit(1000)->get()->getResultArray();
        $found=[];
        foreach($candidate as $op){
            $main=(int)$op['corretor_pessoa_id'];
            $second=(int)$op['segundo_corretor_pessoa_id'];
            if($main===0||$second===0||$main===$second)continue;
            $mainOwner=GestaoEquipe::donoPadrao($db,$main);
            $secondOwner=GestaoEquipe::donoPadrao($db,$second);
            if($mainOwner===$secondOwner)continue;
            $visit=$db->table('visitas')->where('id',(int)$op['visita_id'])->get()->getRowArray();
            if(!$visit)continue;
            if(!GestaoEquipe::renovacaoExterna($db,(int)$op['cliente_id'],$main,$visit,$second,(int)$op['id']))continue;
            $found[]=['id'=>(int)$op['id'],'main'=>$main,'second'=>$second];
            CLI::write('Possível renovação externa: venda #'.$op['id'].
                ' · titular '.$main.' · segundo corretor '.$second,'yellow');
        }
        CLI::write('Identificadas '.count($found).' venda(s) para revisão.','cyan');
        if(!$apply){
            CLI::write('Apenas consulta. Para registrar essas classificações: php spark splash:revisar-renovacoes aplicar','yellow');
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
                $new=['renovacao_externa'=>1,'atualizado_em'=>date('Y-m-d H:i:s')];
                $db->table('venda_operacoes')->where('id',$item['id'])->update($new);
                $db->table('venda_operacoes_auditoria')->insert([
                    'operacao_id'=>$item['id'],'acao'=>'RECLASSIFICAR_RENOVACAO',
                    'dados_antes'=>json_encode(['renovacao_externa'=>false],JSON_THROW_ON_ERROR),
                    'dados_depois'=>json_encode(['renovacao_externa'=>true],JSON_THROW_ON_ERROR),
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
        CLI::write('Reclassificadas: '.$done.'. Não houve recálculo de comissões nem alteração do financeiro.','green');
    }
}
