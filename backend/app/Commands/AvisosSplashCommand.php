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
  $future=(new \DateTimeImmutable($today))->modify('+60 days')->format('Y-m-d');
  foreach($db->table('venda_operacoes v')
    ->select('v.id,v.numero_titulo,v.sigla_plano,v.data_vencimento,v.corretor_pessoa_id')
    ->join('titulo_vinculos l','l.operacao_origem_id=v.id','left')
    ->where('v.situacao','VENDA')->where('l.id IS NULL',null,false)
    ->where('v.data_vencimento >=',(new \DateTimeImmutable($today))->modify('-7 days')->format('Y-m-d'))
    ->where('v.data_vencimento <=',$future)->limit(600)->get()->getResultArray() as $sale){
    $days=(int)(new \DateTimeImmutable($today))->diff(new \DateTimeImmutable($sale['data_vencimento']))->format('%r%a');
    $bucket=$days<=0?'VENCIDO':($days<=7?'7':($days<=30?'30':'60'));
    $key='TITULO:'.$sale['id'].':'.$bucket.':'.$sale['data_vencimento'];
    foreach($toUsers([(int)$sale['corretor_pessoa_id']]) as $u){
      AvisosSplash::alertaUsuario($u,$key,'TITULO','Vencimento de título',
        'Título '.$sale['numero_titulo'].' '.$sale['sigla_plano'].' vence em '.$sale['data_vencimento'].'.','titulos');
    }
  }
  foreach($db->table('visitas')->select('id,retorno_previsto,atendente_pessoa_id')
      ->where('retorno_previsto', $today)->limit(300)->get()->getResultArray() as $visit){
    foreach($toUsers([(int)($visit['atendente_pessoa_id']??0)]) as $u)
      AvisosSplash::alertaUsuario($u,'RETORNO:'.$visit['id'].':'.$today,
        'RETORNO','Retorno agendado','Existe um atendimento com retorno programado para hoje.','atendimentos');
  }
  $limit=(new \DateTimeImmutable($today))->modify('-60 days')->format('Y-m-d');
  foreach($db->table('venda_operacoes')->select('id,data_negociacao,corretor_pessoa_id')
      ->where('situacao','PENDENCIA')->where('data_negociacao <=',$limit)->limit(300)
      ->get()->getResultArray() as $pending){
    foreach($toUsers([(int)$pending['corretor_pessoa_id']]) as $u)
      AvisosSplash::alertaUsuario($u,'PENDENCIA:'.$pending['id'].':60',
        'PENDENCIA','Pendência com mais de 60 dias',
        'Existe uma negociação pendente que precisa de conferência.','pendencias');
  }
  $out=EnvioPushSplash::enviar(50);
  CLI::write('SPLASH: avisos gerados e fila executada. '.json_encode($out,JSON_UNESCAPED_UNICODE),'green');
 }
}
