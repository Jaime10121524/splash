#!/usr/bin/env python3
"""Gera ZIP de atualização HostGator offline para cPanel (sem CLI no servidor).

Executado no GitHub Actions. Nunca inclua .env, writable ou vendor na web.
"""
from __future__ import annotations
import hashlib
import os
import subprocess
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'deploy'/'_pacote_hostgator_sem_terminal'
OUT.mkdir(parents=True,exist_ok=True)
PHP=OUT/'SPLASH_PHP_BACKEND.zip'
WEB=OUT/'SPLASH_WEB_PUBLICO.zip'
MASTER=OUT/'SPLASH_HOSTGATOR_SEM_TERMINAL.zip'
SQL=ROOT/'deploy'/'hostgator'/'sql-manual'
PUBLIC=ROOT/'deploy'/'hostgator'/'public_html'
DOC=ROOT/'deploy'/'hostgator'/'LEIA_PRIMEIRO_SEM_TERMINAL.txt'
DIST=ROOT/'frontend'/'dist'

def addtree(z:zipfile.ZipFile,src:Path,prefix:str='') -> int:
    if not src.is_dir():
        raise RuntimeError(f'Pasta não encontrada: {src}')
    count=0
    for file in sorted(src.rglob('*')):
        if not file.is_file():
            continue
        rel=file.relative_to(src)
        # Não colocar credenciais ou dados pessoais em artefatos do CI.
        if any(s in {'.git','.env','vendor','writable','node_modules'} or s.startswith('.env.')
               for s in rel.parts):
            continue
        z.write(file,arcname=(Path(prefix)/rel).as_posix())
        count+=1
    return count

def safezip(file:Path) -> zipfile.ZipFile:
    return zipfile.ZipFile(file,'w',zipfile.ZIP_DEFLATED,compresslevel=9)

if not (DIST/'index.html').is_file():
    raise RuntimeError('Compile o Vite ANTES do empacotamento.')
if not (ROOT/'backend'/'app'/'Config'/'Routes.php').is_file():
    raise RuntimeError('Rotas PHP não encontradas.')
if len(list(SQL.glob('*.sql')))<4:
    raise RuntimeError('SQL manual incompleto.')

with safezip(PHP) as z:
    n=addtree(z,ROOT/'backend'/'app','app')
    n+=addtree(z,ROOT/'backend'/'public','public')
    for p in ('spark','composer.json','composer.lock'):
        f=ROOT/'backend'/p
        if f.is_file(): z.write(f,arcname=p)
    if n<40:raise RuntimeError('Backend suspeitamente incompleto.')

with safezip(WEB) as z:
    n=addtree(z,DIST)
    n+=addtree(z,PUBLIC)
    if n<4:raise RuntimeError('Frontend ou api ausentes.')

commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
manifest=[
    'SPLASH / pacote cPanel sem terminal',
    f'Git commit: {commit}',
    'Branch: feature/react-native-splash-mobile',
    'PHP: atualizar somente backend privado (sem apagar vendor/.env/writable)',
    'WEB: atualizar somente document root do SPLASH',
    'SQL: executar na ordem indicada apos backup',
    '',
]
for file in (PHP,WEB):
    manifest.append(f'{file.name} SHA256 {hashlib.sha256(file.read_bytes()).hexdigest()}')
manifest.append('')
manifest_bytes=('\n'.join(manifest)+'\n').encode('utf-8')
with safezip(MASTER) as z:
    z.write(PHP,arcname=PHP.name)
    z.write(WEB,arcname=WEB.name)
    z.writestr('MANIFESTO_SHA256.txt',manifest_bytes)
    z.write(DOC,arcname='LEIA_PRIMEIRO.txt')
    addtree(z,SQL,'SQL_PHPMyAdmin')
for file in (PHP,WEB,MASTER):
    print(f'{file}: {file.stat().st_size:,} bytes')
print('Commit:',commit)
