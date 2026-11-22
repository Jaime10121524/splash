-- SPLASH | 01_ATUALIZAR_ESTRUTURA.sql
-- Requisito: banco instalado com schema anterior, ate 2026-11-03.
-- Execute APOS backup validado, no phpMyAdmin. Script reexecutável por campo.
-- Corresponde EXATAMENTE às migrations 2026-11-21-000001 e 2026-11-22-000001..000004.
-- NAO rode se a consulta 00 demonstrar que faltam migrations mais antigas.
-- MySQL/MariaDB: CREATE/ALTER TABLE fazem commits implícitos.
-- Em caso de erro INTERROMPA e confira o backup: não continue para 02.
-- venda_operacoes.renovacao_externa
SET @splash_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='venda_operacoes' AND COLUMN_NAME='renovacao_externa'), 'SELECT \'JA_EXISTE: venda_operacoes.renovacao_externa\' AS status', 'ALTER TABLE `venda_operacoes` ADD COLUMN `renovacao_externa` TINYINT(1) NOT NULL DEFAULT 0');
PREPARE splash_stmt FROM @splash_ddl;
EXECUTE splash_stmt;
DEALLOCATE PREPARE splash_stmt;

-- pessoas.usa_sistema
SET @splash_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pessoas' AND COLUMN_NAME='usa_sistema'), 'SELECT \'JA_EXISTE: pessoas.usa_sistema\' AS status', 'ALTER TABLE `pessoas` ADD COLUMN `usa_sistema` TINYINT(1) NOT NULL DEFAULT 0 AFTER `ativo`');
PREPARE splash_stmt FROM @splash_ddl;
EXECUTE splash_stmt;
DEALLOCATE PREPARE splash_stmt;

UPDATE `pessoas` SET `usa_sistema`=1 WHERE `user_id` IS NOT NULL AND `usa_sistema`<>1;

CREATE TABLE IF NOT EXISTS `gestor_corretores` (
  `corretor_pessoa_id` INT UNSIGNED NOT NULL,
  `gestor_pessoa_id` INT UNSIGNED NOT NULL,
  `criado_em` DATETIME NOT NULL,
  PRIMARY KEY (`corretor_pessoa_id`),
  KEY `gestor_pessoa_id` (`gestor_pessoa_id`),
  CONSTRAINT `fk_equipe_corretor` FOREIGN KEY (`corretor_pessoa_id`)
    REFERENCES `pessoas` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_equipe_gestor` FOREIGN KEY (`gestor_pessoa_id`)
    REFERENCES `pessoas` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- pessoas.dono_corrente_padrao_pessoa_id
SET @splash_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pessoas' AND COLUMN_NAME='dono_corrente_padrao_pessoa_id'), 'SELECT \'JA_EXISTE: pessoas.dono_corrente_padrao_pessoa_id\' AS status', 'ALTER TABLE `pessoas` ADD COLUMN `dono_corrente_padrao_pessoa_id` INT UNSIGNED NULL DEFAULT NULL AFTER `usa_sistema`');
PREPARE splash_stmt FROM @splash_ddl;
EXECUTE splash_stmt;
DEALLOCATE PREPARE splash_stmt;

-- pessoas.gestor_visao_global
SET @splash_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pessoas' AND COLUMN_NAME='gestor_visao_global'), 'SELECT \'JA_EXISTE: pessoas.gestor_visao_global\' AS status', 'ALTER TABLE `pessoas` ADD COLUMN `gestor_visao_global` TINYINT(1) NOT NULL DEFAULT 0 AFTER `dono_corrente_padrao_pessoa_id`');
PREPARE splash_stmt FROM @splash_ddl;
EXECUTE splash_stmt;
DEALLOCATE PREPARE splash_stmt;

CREATE TABLE IF NOT EXISTS `pendencia_adiantamentos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `operacao_id` INT UNSIGNED NOT NULL,
  `tipo` VARCHAR(12) NOT NULL,
  `referencia_adiantamento_id` INT UNSIGNED NULL,
  `origem` VARCHAR(12) NOT NULL,
  `beneficiario_pessoa_id` INT UNSIGNED NOT NULL,
  `valor` DECIMAL(12,2) NOT NULL,
  `data_movimento` DATE NOT NULL,
  `observacoes` VARCHAR(500) NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `criado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `operacao_id` (`operacao_id`),
  KEY `referencia_adiantamento_id` (`referencia_adiantamento_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- venda_operacoes.responsavel_financeiro_pessoa_id
SET @splash_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='venda_operacoes' AND COLUMN_NAME='responsavel_financeiro_pessoa_id'), 'SELECT \'JA_EXISTE: venda_operacoes.responsavel_financeiro_pessoa_id\' AS status', 'ALTER TABLE `venda_operacoes` ADD COLUMN `responsavel_financeiro_pessoa_id` INT UNSIGNED NULL DEFAULT NULL AFTER `dono_corrente_pessoa_id`');
PREPARE splash_stmt FROM @splash_ddl;
EXECUTE splash_stmt;
DEALLOCATE PREPARE splash_stmt;

SELECT 'ESTRUTURA CONCLUIDA: execute agora 02_REGISTRAR_MIGRACOES.sql' AS proximo_passo;
