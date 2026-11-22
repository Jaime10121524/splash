-- SPLASH | 00_CONFERIR_ANTES.sql
-- Leia o LEIA_PRIMEIRO.txt. Execute no phpMyAdmin do banco DO SPLASH.
-- Apenas CONSULTA. Nenhuma tabela ou dado é modificado.
SELECT DATABASE() AS banco_selecionado, VERSION() AS versao_mysql_mariadb;
SELECT table_name FROM information_schema.tables
 WHERE table_schema=DATABASE() AND table_name IN
 ('pessoas','venda_operacoes','gestor_corretores','pendencia_adiantamentos','migrations')
 ORDER BY table_name;
SELECT `version`,`class`,`namespace`,`group`,`batch`
 FROM migrations WHERE `namespace`='App'
 AND `version` >= '2026-11-03-000003'
 ORDER BY `version`;
SELECT table_name,column_name,column_type,is_nullable FROM information_schema.columns
 WHERE table_schema=DATABASE() AND
 ((table_name='pessoas' AND column_name IN ('usa_sistema','dono_corrente_padrao_pessoa_id','gestor_visao_global'))
 OR (table_name='venda_operacoes' AND column_name IN ('renovacao_externa','responsavel_financeiro_pessoa_id')))
 ORDER BY table_name,column_name;
