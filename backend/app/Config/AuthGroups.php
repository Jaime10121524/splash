<?php

declare(strict_types=1);

namespace Config;

use CodeIgniter\Shield\Config\AuthGroups as ShieldAuthGroups;

class AuthGroups extends ShieldAuthGroups
{
    // Conta recém-criada por administrador não recebe permissões automaticamente.
    public string $defaultGroup = 'restrito';

    public array $groups = [
        'admin' => [
            'title' => 'Administrador',
            'description' => 'Controle geral, fechamento e configuração.',
        ],
        'corretor' => [
            'title' => 'Corretor',
            'description' => 'Acesso apenas aos próprios valores e cadastros autorizados.',
        ],
        'vendedor' => [
            'title' => 'Vendedor',
            'description' => 'Somente suas vendas e suas comissões, sem dados do associado.',
        ],
        'gerente' => [
            'title' => 'Gerente',
            'description' => 'Somente valores e operações permitidas do gerente.',
        ],
        'restrito' => [
            'title' => 'Acesso restrito',
            'description' => 'Conta sem acesso comercial até a atribuição de um grupo.',
        ],
    ];

    public array $permissions = [
        'admin.access' => 'Acessar administração',
        'users.manage' => 'Administrar usuários',
        'settings.manage' => 'Alterar configurações e regras',
        'visits.manage' => 'Gerenciar atendimentos',
        'sales.all' => 'Consultar todas as vendas',
        'sales.own' => 'Consultar vendas próprias autorizadas',
        'finance.all' => 'Consultar todas as contas financeiras',
        'finance.own' => 'Consultar somente contas financeiras próprias',
        'expenses.own' => 'Gerenciar despesas pessoais',
        'closings.manage' => 'Realizar fechamentos e pagamentos',
        'reports.own' => 'Consultar relatórios próprios',
    ];

    public array $matrix = [
        'admin' => [
            'admin.*', 'users.*', 'settings.*', 'visits.*',
            'sales.*', 'finance.*', 'expenses.*', 'closings.*', 'reports.*',
        ],
        'corretor' => [
            'sales.own', 'finance.own', 'expenses.own', 'reports.own',
        ],
        'vendedor' => [
            'sales.own', 'finance.own', 'reports.own',
        ],
        'gerente' => [
            'sales.own', 'finance.own', 'reports.own',
        ],
        'restrito' => [],
    ];
}
