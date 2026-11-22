-- SPLASH | 02_REGISTRAR_MIGRACOES.sql
-- Rode somente se 01_ATUALIZAR_ESTRUTURA.sql terminou SEM ERROS.
-- Atualiza o historico CodeIgniter 4 para evitar tentar adicionar novamente colunas.
-- Não exclui registros antigos; novos registros só entram quando os objetos existem.
-- IMPORTANTE: se houver mismatch nos tipos/indices das tabelas já existentes,
-- interrompa antes de registrar as migrations e corrija a diferença.
SET @splash_batch = (SELECT COALESCE(MAX(`batch`),0)+1 FROM `migrations`);
-- 2026-11-21-000001 / GestoresEUsuariosAtivos
INSERT INTO `migrations` (`version`,`class`,`group`,`namespace`,`time`,`batch`)
SELECT '2026-11-21-000001',CONCAT('App',CHAR(92),'Database',CHAR(92),'Migrations',CHAR(92),'GestoresEUsuariosAtivos'),
  'default','App',UNIX_TIMESTAMP(),@splash_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `version`='2026-11-21-000001' AND `namespace`='App' AND `group`='default')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='venda_operacoes' AND column_name='renovacao_externa')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='usa_sistema')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='gestor_corretores');

-- 2026-11-22-000001 / CorrentePadraoDaEquipe
INSERT INTO `migrations` (`version`,`class`,`group`,`namespace`,`time`,`batch`)
SELECT '2026-11-22-000001',CONCAT('App',CHAR(92),'Database',CHAR(92),'Migrations',CHAR(92),'CorrentePadraoDaEquipe'),
  'default','App',UNIX_TIMESTAMP(),@splash_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `version`='2026-11-22-000001' AND `namespace`='App' AND `group`='default')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='dono_corrente_padrao_pessoa_id');

-- 2026-11-22-000002 / GestaoGlobalHistorico
INSERT INTO `migrations` (`version`,`class`,`group`,`namespace`,`time`,`batch`)
SELECT '2026-11-22-000002',CONCAT('App',CHAR(92),'Database',CHAR(92),'Migrations',CHAR(92),'GestaoGlobalHistorico'),
  'default','App',UNIX_TIMESTAMP(),@splash_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `version`='2026-11-22-000002' AND `namespace`='App' AND `group`='default')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='gestor_visao_global');

-- 2026-11-22-000003 / PendenciaCustodiaAdiantamentos
INSERT INTO `migrations` (`version`,`class`,`group`,`namespace`,`time`,`batch`)
SELECT '2026-11-22-000003',CONCAT('App',CHAR(92),'Database',CHAR(92),'Migrations',CHAR(92),'PendenciaCustodiaAdiantamentos'),
  'default','App',UNIX_TIMESTAMP(),@splash_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `version`='2026-11-22-000003' AND `namespace`='App' AND `group`='default')
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='pendencia_adiantamentos');

-- 2026-11-22-000004 / ResponsavelFinanceiroVenda
INSERT INTO `migrations` (`version`,`class`,`group`,`namespace`,`time`,`batch`)
SELECT '2026-11-22-000004',CONCAT('App',CHAR(92),'Database',CHAR(92),'Migrations',CHAR(92),'ResponsavelFinanceiroVenda'),
  'default','App',UNIX_TIMESTAMP(),@splash_batch
WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `version`='2026-11-22-000004' AND `namespace`='App' AND `group`='default')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='venda_operacoes' AND column_name='responsavel_financeiro_pessoa_id');

SELECT `version`,`class`,`namespace`,`batch` FROM `migrations`
 WHERE `namespace`='App'
 AND `version` IN ('2026-11-21-000001','2026-11-22-000001','2026-11-22-000002','2026-11-22-000003','2026-11-22-000004')
 ORDER BY `version`;
