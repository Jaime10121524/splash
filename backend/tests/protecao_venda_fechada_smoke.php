<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/ProtecaoVendaFechada.php';

use App\Libraries\ProtecaoVendaFechada;

final class FakeClosingBuilder
{
    public function __construct(private ?array $closing) {}
    public function select(...$args): self { return $this; }
    public function join(...$args): self { return $this; }
    public function where(...$args): self { return $this; }
    public function orderBy(...$args): self { return $this; }
    public function get(): self { return $this; }
    public function getRowArray(): ?array { return $this->closing; }
}
final class FakeClosingDB
{
    public function __construct(private ?array $closing) {}
    public function table(string $name): FakeClosingBuilder
    {
        if($name!=='fechamento_periodo_vendas fv')throw new RuntimeException('Consulta fora do fechamento.');
        return new FakeClosingBuilder($this->closing);
    }
}

$notClosed=new FakeClosingDB(null);
$inProgress=new FakeClosingDB(['id'=>1,'status'=>'RECEBIMENTOS']);
$closed=new FakeClosingDB(['id'=>2,'status'=>'CONCLUIDO']);
if(ProtecaoVendaFechada::bloqueada($notClosed,10)!==false)throw new RuntimeException('Vendas novas devem ser editáveis.');
if(ProtecaoVendaFechada::bloqueada($inProgress,10)!==true)throw new RuntimeException('Venda em fechamento deve ficar bloqueada.');
if(ProtecaoVendaFechada::bloqueada($closed,10)!==true)throw new RuntimeException('Venda concluída deve ficar bloqueada.');
if(ProtecaoVendaFechada::fechamento($closed,10)['id']!==2)throw new RuntimeException('Fechamento original não identificado.');

$reset=file_get_contents(dirname(__DIR__).'/app/Database/ResetScripts/2026-10-10-235959_ResetarVendasFinanceiroTestes.php');
if($reset===false||!str_contains($reset,"ENVIRONMENT!=='development'")
    ||!str_contains($reset,"getenv('SPLASH_CONFIRM_RESET')")
    ||str_contains($reset,"FOREIGN_KEY_CHECKS=0")
    ||!str_contains($reset,'emptyTable()')
    ||!str_contains($reset,'transRollback()')){
    throw new RuntimeException('Reset não contém todas as proteções obrigatórias.');
}
$tables=['venda_operacoes','venda_recebimentos','comissao_rateios','comissao_repasses',
    'comissao_titular_movimentos','fechamento_periodos','fechamento_periodo_vendas',
    'fechamento_periodo_repasses','fechamento_periodo_titulares',
    'financeiro_despesas','financeiro_emprestimos','financeiro_emprestimo_abates',
    'fechamento_custodia_pix_vinculos'];
foreach($tables as $table)if(!str_contains($reset,"'".$table."'")){
    throw new RuntimeException('Reset incompleto, tabela ausente: '.$table);
}
echo "Venda vinculada protegida e reset isolado: 5 grupos de verificações OK\n";
