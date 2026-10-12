<?php
declare(strict_types=1);
namespace App\Commands;

use App\Libraries\AvisosSplash;
use App\Libraries\EnvioPushSplash;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

final class AvisosSplashCommand extends BaseCommand
{
 protected $group='SPLASH - Avisos';
 protected $name='splash:avisos';
 protected $description='Gera lembretes de títulos, visitas e pendências; entrega Web Push em lote.';
 public function run(array $params){
  date_default_timezone_set((string)config('App')->appTimezone);
  $db=db_connect();$today=date('Y-m-d');
  $settings=$db->table('splash_alertas_config')->where('id',1)->get()->getRowArray();
  if(!$settings || !(bool)$settings['ativo']){
    CLI::write('SPLASH: alertas automáticos desativados; reenvio de Push mantido.','yellow');
    CLI::write(json_encode(EnvioPushSplash::enviar(50),JSON_UNESCAPED_UNICODE));
    return;
  }
  $titleDays=array_map('intval',explode(',',(string)$settings['titulos_dias']));
  $maxDays=max($titleDays);
  $pendingDays=(int)$settings['pendencias_dias'];
  $retDays=(int)$settings['retornos_antecedencia_dias'];
  $adminIds=[];
  foreach(auth()->getProvider()->findAll(200) as $u){
   if($u->inGroup('admin')&&!$u->isBanned())$adminIds[]=(int)$u->id;
  }
  $toUsers=static function(array $people)use($db,$adminIds):array{
   $ids=array_unique(array_filter(array_map('intval',$people)));
   $users=$adminIds;
   if($ids){
    foreach($db->table('pessoas')->select('user_id')->whereIn('id',$ids)
      ->where('user_id IS NOT NULL',null,false)->get()->getResultArray() as $p){
      $users[]=(int)$p['user_id'];
    }
   }
   return array_unique($users);
  };
  $future=(new \DateTimeImmutable($today))->modify('+'.$maxDays.' days')->format('Y-m-d');
  foreach($db->table('venda_operacoes v')
    ->select('v.id,v.numero_titulo,v.sigla_plano,v.data_vencimento,v.corretor_pessoa_id')
    ->join('titulo_vinculos l','l.operacao_origem_id=v.id','left')
    ->where('v.situacao','VENDA')->where('l.id IS NULL',null,false)
    ->where('v.data_vencimento >=',(new \DateTimeImmutable($today))->modify('-7 days')->format('Y-m-d'))
    ->where('v.data_vencimento <=',$future)->limit(600)->get()->getResultArray() as $sale){
    $days=(int)(new \DateTimeImmutable($today))->diff(new \DateTimeImmutable($sale['data_vencimento']))->format('%r%a');
    if(!in_array($days,$titleDays,true))continue;
    $bucket=(string)$days;
    $key='TITULO:'.$sale['id'].':'.$bucket.':'.$sale['data_vencimento'];
    foreach($toUsers([(int)$sale['corretor_pessoa_id']]) as $u){
      AvisosSplash::alertaUsuario($u,$key,'TITULO','Vencimento de título',
        'Título '.$sale['numero_titulo'].' '.$sale['sigla_plano'].' vence em '.$sale['data_vencimento'].'.','titulos');
    }
  }
  $retLimit=(new \DateTimeImmutable($today))->modify('+'.$retDays.' days')->format('Y-m-d');
  foreach($db->table('visitas')->select('id,retorno_previsto,atendente_pessoa_id')
      ->where('status','RETORNO')->where('retorno_previsto >=',$today)
      ->where('retorno_previsto <=',$retLimit)->limit(300)->get()->getResultArray() as $visit){
    foreach($toUsers([(int)($visit['atendente_pessoa_id']??0)]) as $u)
      AvisosSplash::alertaUsuario($u,'RETORNO:'.$visit['id'].':'.$visit['retorno_previsto'],
        'RETORNO','Retorno agendado','Há um retorno agendado para '.$visit['retorno_previsto'].'.','atendimentos');
  }
  $limit=(new \DateTimeImmutable($today))->modify('-'.$pendingDays.' days')->format('Y-m-d');
  foreach($db->table('venda_operacoes')->select('id,data_negociacao,corretor_pessoa_id')
      ->where('situacao','PENDENCIA')->where('data_negociacao <=',$limit)->limit(300)
      ->get()->getResultArray() as $pending){
    foreach($toUsers([(int)$pending['corretor_pessoa_id']]) as $u)
      AvisosSplash::alertaUsuario($u,'PENDENCIA:'.$pending['id'].':'.$pendingDays,
        'PENDENCIA','Pendência com mais de '.$pendingDays.' dias',
        'Existe uma negociação pendente que precisa de conferência.','pendencias');
  }
  $out=EnvioPushSplash::enviar(50);
  CLI::write('SPLASH: avisos gerados e fila executada. '.json_encode($out,JSON_UNESCAPED_UNICODE),'green');
 }
}
