<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/ExtratoPermissoes.php';

use App\Libraries\ExtratoPermissoes;

$check=static function(bool $actual,bool $expected,string $description): void {
    if($actual!==$expected)throw new RuntimeException($description);
};

$check(ExtratoPermissoes::repasses(true,false,false),true,'Administrador acompanha todos os repasses.');
$check(ExtratoPermissoes::repasses(false,true,false),true,'Corretor independente vê repasses próprios.');
$check(ExtratoPermissoes::repasses(false,true,true),false,'Corretor delegado não pode ver terceiros.');
$check(ExtratoPermissoes::repasses(false,false,false),false,'Vendedor e gerente não veem repasses de terceiros.');
$check(ExtratoPermissoes::financeiroPessoal(true,false),true,'Administrador pode consultar contas pessoais.');
$check(ExtratoPermissoes::financeiroPessoal(false,true),true,'Corretor vê despesas e empréstimos próprios.');
$check(ExtratoPermissoes::financeiroPessoal(false,false),false,'Vendedor/gerente não vê despesas e empréstimos.');
echo "Escopo de extrato financeiro: 7 verificações OK\n";
