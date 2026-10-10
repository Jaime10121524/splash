<?php
declare(strict_types=1);

// CI smoke tests do not install CodeIgniter dependencies: read only the
// declared inventory, without running, loading or connecting to a database.
$path=dirname(__DIR__).'/app/Database/ResetScripts/2026-10-11-000001_ResetCompletoDadosTestes.php';
$source=file_get_contents($path);
if($source===false || !preg_match('/public const TABLES = \[(.*?)\];/s',$source,$inventory)){
    throw new RuntimeException('Inventário declarado do reset não encontrado.');
}
preg_match_all("/'([a-z_]+)'/",$inventory[1],$names);
$tables=$names[1];
$required=[
    'fechamento_custodia_pix_vinculos','fechamento_custodia_movimentos',
    'fechamento_periodo_eventos','fechamento_periodo_abates',
    'fechamento_periodo_repasses','fechamento_periodo_titulares',
    'fechamento_periodo_entradas','fechamento_periodo_vendas',
    'fechamento_periodo_pessoas','fechamento_periodos',
    'financeiro_emprestimo_abates','comissao_titular_movimentos',
    'comissao_repasses','comissao_lotes_pagamento',
    'comissao_rateios_auditoria','comissao_auto_apuracoes',
    'comissao_rateios','venda_comissao_ajustes',
    'venda_operacoes_auditoria','venda_recebimentos',
    'financeiro_emprestimos','financeiro_despesas','venda_operacoes',
    'visita_corretor_historico','visita_resultados_historico',
    'visita_sessoes','visita_status_historico',
    'cliente_corrente_historico','visitas','clientes',
];

if (count($tables)!==count(array_unique($tables))) {
    throw new RuntimeException('Tabela duplicada no reset completo.');
}
if (array_diff($required,$tables)||array_diff($tables,$required)) {
    throw new RuntimeException('Inventário de tabelas do reset incompleto ou inesperado.');
}
foreach (['users','pessoas','planos','plano_versoes','lead_origens',
    'motivos_nao_venda','venda_formas_pagamento','comissao_politicas',
    'financeiro_categorias_despesa','fechamento_responsabilidades'] as $config) {
    if (in_array($config,$tables,true)) {
        throw new RuntimeException('Reset não deve excluir cadastro-base '.$config);
    }
}

$before=static function(string $child,string $parent)use($tables): void {
    $a=array_search($child,$tables,true);$b=array_search($parent,$tables,true);
    if ($a===false||$b===false||$a>=$b) {
        throw new RuntimeException('Ordem inválida de chaves estrangeiras: '.$child.' antes de '.$parent);
    }
};
foreach ([
    ['fechamento_custodia_pix_vinculos','fechamento_custodia_movimentos'],
    ['fechamento_custodia_movimentos','fechamento_periodos'],
    ['fechamento_periodo_vendas','venda_operacoes'],
    ['fechamento_periodo_repasses','comissao_repasses'],
    ['fechamento_periodo_titulares','comissao_titular_movimentos'],
    ['fechamento_periodo_abates','financeiro_emprestimos'],
    ['financeiro_emprestimo_abates','comissao_lotes_pagamento'],
    ['comissao_repasses','comissao_rateios'],
    ['venda_recebimentos','venda_operacoes'],
    ['visita_sessoes','visitas'],
    ['visita_corretor_historico','visitas'],
    ['visita_resultados_historico','visitas'],
    ['visita_status_historico','visitas'],
    ['venda_operacoes','visitas'],
    ['venda_operacoes','clientes'],
    ['cliente_corrente_historico','clientes'],
    ['visitas','clientes'],
] as [$child,$parent]) $before($child,$parent);

$command=file_get_contents(dirname(__DIR__).'/app/Commands/ResetCompletoTestes.php');

if ($source===false || $command===false
    || !str_contains($source, "ENVIRONMENT !== 'development'")
    || !str_contains($source, "getenv('SPLASH_CONFIRM_RESET_COMPLETO')")
    || !str_contains($source, 'transBegin()')
    || !str_contains($source, 'transRollback()')
    || !str_contains($source, 'emptyTable()')
    || !str_contains($source, "indicador_cliente_id' => null")
    || str_contains($source,'SET FOREIGN_KEY_CHECKS')
    || str_contains($source,'TRUNCATE')
    || !str_contains($command,'(new ResetCompletoDadosTestes())->up()')
    || !str_contains($command,'require_once APPPATH')
    || !str_contains($command,'countAllResults()')) {
    throw new RuntimeException('Proteções de migração/comando de limpeza estão incompletas.');
}
if (is_file(dirname(__DIR__).'/app/Database/Migrations/2026-10-11-000001_ResetCompletoDadosTestes.php')) {
    throw new RuntimeException('Reset completo não pode entrar em migrations normais.');
}
echo "Reset completo: 30 tabelas, relações, cadastros e proteções OK\n";
