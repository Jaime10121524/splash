# Executar na raiz do clone: .\setup-local.ps1
# Pré-requisitos: PHP 8.2+, Composer 2, Node.js/npm e Git.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require-Command([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Comando '$name' não encontrado no PATH. Instale/configure antes de continuar."
    }
}

Require-Command php
Require-Command composer
Require-Command node
Require-Command npm

$version = (& php -r 'echo PHP_VERSION_ID;').Trim()
if ($LASTEXITCODE -ne 0 -or [int]$version -lt 80200) {
    throw 'SPLASH precisa de PHP 8.2 ou superior (requisito das versões atuais do CodeIgniter/Shield).'
}

Push-Location $PSScriptRoot
try {
    if (-not (Test-Path 'backend/composer.json')) {
        if (Test-Path 'backend') { throw "Pasta backend já existe sem composer.json. Confira antes de sobrescrever." }
        Write-Host 'Instalando o AppStarter oficial do CodeIgniter 4...' -ForegroundColor Cyan
        & composer create-project codeigniter4/appstarter backend --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar backend.' }
    }

    Push-Location backend
    try {
        Write-Host 'Instalando o Shield...' -ForegroundColor Cyan
        & composer require codeigniter4/shield --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o Shield.' }

        if (-not (Test-Path '.env')) {
            Copy-Item env .env
            Write-Host 'backend/.env criado; configure banco e URL antes do Shield setup.' -ForegroundColor Yellow
        }
    }
    finally { Pop-Location }

    if (-not (Test-Path 'frontend/package.json')) {
        if (Test-Path 'frontend') { throw "Pasta frontend já existe sem package.json. Confira antes de sobrescrever." }
        Write-Host 'Criando React + Vite...' -ForegroundColor Cyan
        & npm create vite@latest frontend -- --template react
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar frontend.' }
    }

    Push-Location frontend
    try {
        Write-Host 'Instalando pacotes da interface...' -ForegroundColor Cyan
        & npm install
        if ($LASTEXITCODE -ne 0) { throw 'Falha no npm install.' }
        & npm install react-router-dom lucide-react
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar bibliotecas React.' }
    }
    finally { Pop-Location }

    Write-Host ''
    Write-Host 'Dependências iniciais instaladas.' -ForegroundColor Green
    Write-Host 'Próximos passos: criar banco splash, configurar backend/.env e rodar php spark shield:setup.'
    Write-Host 'Depois, envie os arquivos gerados ao Git com commit/push.'
}
finally { Pop-Location }
