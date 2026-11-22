-- SPLASH | 03_CONFERIR_DEPOIS.sql
-- Todos devem aparecer com 'OK'. Somente consultas.
SELECT 'venda_operacoes.renovacao_externa' AS objeto,IF(COUNT(*)=1,'OK','FALTA') AS status
 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='venda_operacoes' AND column_name='renovacao_externa'
UNION ALL SELECT 'pessoas.usa_sistema',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='usa_sistema'
UNION ALL SELECT 'pessoas.dono_corrente_padrao_pessoa_id',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='dono_corrente_padrao_pessoa_id'
UNION ALL SELECT 'pessoas.gestor_visao_global',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pessoas' AND column_name='gestor_visao_global'
UNION ALL SELECT 'venda_operacoes.responsavel_financeiro_pessoa_id',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='venda_operacoes' AND column_name='responsavel_financeiro_pessoa_id'
UNION ALL SELECT 'gestor_corretores',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='gestor_corretores'
UNION ALL SELECT 'pendencia_adiantamentos',IF(COUNT(*)=1,'OK','FALTA') FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='pendencia_adiantamentos'
UNION ALL SELECT 'migration 2026-11-21-000001',IF(COUNT(*)=1,'OK','FALTA') FROM migrations WHERE namespace='App' AND version='2026-11-21-000001'
UNION ALL SELECT 'migration 2026-11-22-000001',IF(COUNT(*)=1,'OK','FALTA') FROM migrations WHERE namespace='App' AND version='2026-11-22-000001'
UNION ALL SELECT 'migration 2026-11-22-000002',IF(COUNT(*)=1,'OK','FALTA') FROM migrations WHERE namespace='App' AND version='2026-11-22-000002'
UNION ALL SELECT 'migration 2026-11-22-000003',IF(COUNT(*)=1,'OK','FALTA') FROM migrations WHERE namespace='App' AND version='2026-11-22-000003'
UNION ALL SELECT 'migration 2026-11-22-000004',IF(COUNT(*)=1,'OK','FALTA') FROM migrations WHERE namespace='App' AND version='2026-11-22-000004';
SELECT `version`,`class`,`batch` FROM migrations WHERE namespace='App' AND version >= '2026-11-21-000001' ORDER BY `version`;
