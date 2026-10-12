<?php
declare(strict_types=1);

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Throwable;

/**
 * Backup integral sem depender de mysqldump/proc_open (HostGator compartilhada).
 * Arquivo privado .sql.gz, com snapshot consistente para tabelas InnoDB.
 */
final class BackupSplashCommand extends BaseCommand
{
    protected $group='SPLASH - Segurança';
    protected $name='splash:backup';
    protected $description='Exporta backup SQL gzip do banco configurado para uma pasta privada.';

    private static function write($file,string $part):void
    {
        $size=strlen($part);
        $sent=0;
        while($sent<$size){
            $done=gzwrite($file,substr($part,$sent));
            if(!is_int($done)||$done<=0)throw new \RuntimeException('Falha ao gravar backup.');
            $sent+=$done;
        }
    }
    private static function ident(string $name):string
    {
        return '`'.str_replace('`','``',$name).'`';
    }

    public function run(array $params):void
    {
        if(PHP_SAPI!=='cli')throw new \RuntimeException('Somente execução pelo terminal/cron.');
        $folder=(string)(env('SPLASH_BACKUP_DIR')?:WRITEPATH.'backups');
        if(!is_dir($folder) && !mkdir($folder,0700,true) && !is_dir($folder))
            throw new \RuntimeException('Não foi possível criar a pasta de backup.');
        $dir=realpath($folder);
        $public=realpath(FCPATH);
        if(!$dir || ($public && ($dir===$public || str_starts_with($dir.DIRECTORY_SEPARATOR,$public.DIRECTORY_SEPARATOR)))){
            throw new \RuntimeException('Pasta pública proibida para backups.');
        }
        @chmod($dir,0700);
        $file=$dir.DIRECTORY_SEPARATOR.'splash_'.date('Ymd_His').'_'.bin2hex(random_bytes(3)).'.sql.gz';
        $handle=gzopen($file,'wb6');
        if(!$handle)throw new \RuntimeException('Não foi possível abrir arquivo de backup.');
        @chmod($file,0600);
        $db=db_connect();
        $snapshot=false;
        try{
            $db->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            $db->query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
            $snapshot=true;
            self::write($handle,"-- SPLASH backup privado\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
            $tables=$db->query('SHOW FULL TABLES')->getResultArray();
            foreach($tables as $info){
                $fields=array_values($info);
                $name=(string)$fields[0];
                if(strtoupper((string)($fields[1]??''))!=='BASE TABLE')continue;
                $identifier=self::ident($name);
                $definition=$db->query('SHOW CREATE TABLE '.$identifier)->getRowArray();
                $create=$definition['Create Table']??null;
                if(!$create)throw new \RuntimeException('Estrutura indisponível: '.$name);
                self::write($handle,"\nDROP TABLE IF EXISTS ".$identifier.";\n".$create.";\n");
                $offset=0;
                do{
                    $rows=$db->query('SELECT * FROM '.$identifier.' LIMIT 200 OFFSET '.$offset)->getResultArray();
                    foreach($rows as $row){
                        $names=array_map([self::class,'ident'],array_keys($row));
                        $values=array_map(
                            static fn($value)=>$value===null?'NULL':$db->escape($value),
                            array_values($row)
                        );
                        self::write($handle,'INSERT INTO '.$identifier.' ('.implode(',',$names).') VALUES ('.
                            implode(',',$values).");\n");
                    }
                    $count=count($rows);
                    $offset+=$count;
                }while($count===200);
            }
            self::write($handle,"\nSET FOREIGN_KEY_CHECKS=1;\n");
            $db->query('COMMIT');
            $snapshot=false;
            gzclose($handle);
            $handle=null;
            if(!is_file($file)||filesize($file)<128)throw new \RuntimeException('Backup vazio ou inválido.');

            $keep=max(7,min(365,(int)(env('SPLASH_BACKUP_KEEP_DAYS')?:30)));
            $cutoff=time()-$keep*86400;
            foreach(glob($dir.DIRECTORY_SEPARATOR.'splash_*.sql.gz')?:[] as $old){
                if($old===$file)continue;
                if(is_file($old) && filemtime($old)<$cutoff)@unlink($old);
            }
            CLI::write('Backup concluído: '.$file.' ('.filesize($file).' bytes).','green');
            CLI::write('IMPORTANTE: copie os backups periodicamente para local externo à HostGator.','yellow');
        }catch(Throwable $e){
            if($snapshot){try{$db->query('ROLLBACK');}catch(Throwable){}}
            if($handle)gzclose($handle);
            if(is_file($file))@unlink($file);
            CLI::error('Backup não foi concluído: '.$e->getMessage());
            throw $e;
        }
    }
}
