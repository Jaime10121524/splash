param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$BaseRef = 'origin/main'
)
$ErrorActionPreference = 'Stop'
Set-Location $Root

# Este pacote e um PATCH, NAO uma instalacao nova. Use como BaseRef
# a revisao realmente presente na HostGator. O padrao origin/main
# so e correto se main corresponder a versao atualmente publicada.
$active = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $active -ne 'feature/react-native-splash-mobile') {
    throw 'Selecione antes a branch feature/react-native-splash-mobile.'
}
$dirty = @(& git status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
    throw 'Existem alteracoes locais rastreadas. Faca commit ou stash antes de gerar pacote consistente.'
}
$baseSha = (& git rev-parse --verify $BaseRef)
if ($LASTEXITCODE -ne 0) { throw "Referencia base inexistente: $BaseRef" }
$headSha = (& git rev-parse HEAD).Trim()
$compare = "$BaseRef...HEAD"

$deleted = @(& git diff --name-only --diff-filter=D $compare -- backend)
if ($LASTEXITCODE -ne 0) { throw 'Erro ao comparar exclusoes do backend.' }
if ($deleted.Count -gt 0) {
    throw ('O backend possui arquivos excluidos desde a base. Revise manualmente antes de publicar: ' + ($deleted -join ', '))
}
$backendAll = @(& git diff --name-only --diff-filter=ACMR $compare -- backend)
if ($LASTEXITCODE -ne 0) { throw 'Erro ao comparar backend.' }
$outsideApp = @($backendAll | Where-Object { $_ -notmatch '^backend/app/' })
if ($outsideApp.Count -gt 0) {
    throw ('Mudancas em backend fora de app/, que exigem deploy especifico: ' + ($outsideApp -join ', '))
}

$stage = Join-Path $Root 'deploy\_atualizacao_incremental_hostgator'
$backendStage = Join-Path $stage 'BACKEND'
$webStage = Join-Path $stage 'WEB'
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $backendStage,$webStage -Force | Out-Null

# Copia somente codigo PHP que mudou. Os caminhos dentro do ZIP
# serao app/Config/..., app/Controllers/... etc, para extrair
# diretamente em /home/USUARIO/splash-backend.
foreach ($file in $backendAll) {
    $file = ([string]$file).Trim()
    if (-not $file) { continue }
    $source = Join-Path $Root ($file.Replace('/','\'))
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Arquivo alterado nao encontrado: $file"
    }
    $relative = $file.Substring('backend/'.Length).Replace('/','\')
    $dest = Join-Path $backendStage $relative
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $dest -Force
}

# A aplicacao web usa assets Vite versionados: publicar index.html
# e os assets compilados JUNTOS; nao copiar arquivos src/*.jsx.
Push-Location (Join-Path $Root 'frontend')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build web falhou. Nenhum ZIP deve ser publicado.' }
} finally { Pop-Location }

$dist = Join-Path $Root 'frontend\dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
    throw 'O build web nao gerou index.html.'
}
Copy-Item -Path (Join-Path $dist '*') -Destination $webStage -Recurse -Force

$backendZip = Join-Path $stage 'SPLASH_BACKEND_ATUALIZACAO.zip'
$webZip = Join-Path $stage 'SPLASH_WEB_ATUALIZACAO.zip'
if ($backendAll.Count -gt 0) {
    Compress-Archive -Path (Join-Path $backendStage '*') -DestinationPath $backendZip -Force
}
Compress-Archive -Path (Join-Path $webStage '*') -DestinationPath $webZip -Force

$migrations = @($backendAll | Where-Object { $_ -like 'backend/app/Database/Migrations/*' })
$summary = @(
    'SPLASH NEXT - Atualizacao incremental de sistema JA INSTALADO'
    "Base de comparacao: $BaseRef ($($baseSha.Trim()))"
    "Revisao alvo: $headSha"
    ''
    '1. FAZER BACKUP DO BANCO E DOS ARQUIVOS ATUAIS ANTES DE PUBLICAR.'
    '2. EXTRAIR SPLASH_BACKEND_ATUALIZACAO.zip DENTRO DA PASTA PRIVADA splash-backend.'
    '3. EXTRAIR SPLASH_WEB_ATUALIZACAO.zip NO DOCUMENT ROOT DO SPLASH EXISTENTE.'
    '4. PRESERVAR .env, writable, vendor, uploads, backups e os .htaccess existentes.'
    '5. NO BACKEND PRIVADO, CONFERIR php spark migrate:status E DEPOIS php spark migrate.'
    '6. VALIDAR HTTPS, login, /api/mobile/ping, usuarios, vendas e financeiro.'
    ''
    'ATENCAO: Main e apenas referencia Git; confirmar que representa a versao hospedada.'
    'Backend: arquivos selecionados desde a base:'
) + $backendAll + @(
    ''
    'Migrations alteradas/criadas desde a base (nao executar manualmente):'
) + $migrations
Set-Content -LiteralPath (Join-Path $stage 'LEIA_ANTES_DE_PUBLICAR.txt') -Value $summary -Encoding UTF8

Write-Host ''
Write-Host 'PATCH DE ATUALIZACAO GERADO' -ForegroundColor Green
Write-Host "Base: $BaseRef -> versao: $headSha"
Write-Host "Backend: $($backendAll.Count) arquivos; migrations: $($migrations.Count)"
Write-Host "WEB: $webZip"
Write-Host "PHP: $backendZip"
Write-Host "Leia: $(Join-Path $stage 'LEIA_ANTES_DE_PUBLICAR.txt')"
Write-Host 'Nao substituir configuracoes ou excluir diretorios existentes no servidor.'
