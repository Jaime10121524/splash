param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)
$ErrorActionPreference = 'Stop'
Set-Location $Root

# Os dois artefatos são gerados separadamente para não colocar o PHP privado em public_html.
$staging = Join-Path $Root 'deploy\_saida_hostgator'
$public = Join-Path $staging 'public_html'
$private = Join-Path $staging 'splash-backend'
if(Test-Path $staging){Remove-Item -Recurse -Force $staging}
New-Item -ItemType Directory -Force $public,$private | Out-Null

Push-Location (Join-Path $Root 'frontend')
try{
    npm.cmd run build
    if($LASTEXITCODE -ne 0){throw 'Falha no build do frontend.'}
} finally { Pop-Location }

Copy-Item (Join-Path $Root 'frontend\dist\*') $public -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'public_html\.htaccess') $public -Force
New-Item -ItemType Directory -Force (Join-Path $public 'api') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'public_html\api\*') (Join-Path $public 'api') -Recurse -Force

$backend = Join-Path $Root 'backend'
if(-not(Test-Path (Join-Path $backend 'vendor\autoload.php'))){
    throw 'Dependências PHP ausentes. Instale com composer install antes de preparar o pacote.'
}
foreach($name in @('app','public','vendor')){
    Copy-Item (Join-Path $backend $name) (Join-Path $private $name) -Recurse -Force
}
foreach($name in @('spark','composer.json','composer.lock')){
    Copy-Item (Join-Path $backend $name) $private -Force
}
foreach($folder in @('writable\cache','writable\logs','writable\session','writable\uploads','writable\backups')){
    New-Item -ItemType Directory -Force (Join-Path $private $folder) | Out-Null
}

# O arquivo .env NÃO é copiado para nenhum zip. Preencher diretamente no servidor.
$publicZip = Join-Path $staging 'SPLASH_PUBLICO.zip'
$privateZip = Join-Path $staging 'SPLASH_PRIVADO.zip'
Compress-Archive -Path (Join-Path $public '*') -DestinationPath $publicZip -Force
# Os arquivos ocultos (.htaccess) são inseridos pelo ZipArchive .NET, sem depender
# da inclusão de dotfiles pelo wildcard do Compress-Archive.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[System.IO.Compression.ZipFile]::Open($publicZip,[System.IO.Compression.ZipArchiveMode]::Update)
try{
    foreach($item in @('.htaccess','api/.htaccess')){
        if(-not $zip.GetEntry($item)){
            $path=Join-Path $public ($item.Replace('/','\'))
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,$path,$item,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
}finally{$zip.Dispose()}
Compress-Archive -Path (Join-Path $private '*') -DestinationPath $privateZip -Force
Write-Host "Pacotes prontos:" -ForegroundColor Green
Write-Host "Público : $publicZip"
Write-Host "Privado : $privateZip"
Write-Host 'ATENÇÃO: nunca coloque SPLASH_PRIVADO.zip dentro de public_html.'
