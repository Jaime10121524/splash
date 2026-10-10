<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Seleção automática por pagamentos do CLIENTE. Nada é pago ao corretor aqui.
 * Cada operação congela as quatro regras na criação, inclusive as históricas.
 */
final class ComissaoAutomatica
{
    public const CODES=['AVISTA_ATUAL','AVISTA_HISTORICA','CARTAO','MISTO'];

    public static function configs($db): array
    {
        $rows=$db->table('venda_regras_aplicacao a')
            ->select('a.codigo,a.regra_comissao_id, r.nome,r.modalidade,r.numerador,r.denominador,r.desconto_cartao')
            ->join('venda_regras_comissao r','r.id=a.regra_comissao_id')
            ->get()->getResultArray();
        $rules=[];
        foreach($rows as $r){
            $rules[$r['codigo']]=[
                'id'=>(int)$r['regra_comissao_id'],
                'nome'=>$r['nome'],'modalidade'=>$r['modalidade'],
                'numerador'=>(int)$r['numerador'],
                'denominador'=>(int)$r['denominador'],
                'desconto_cartao'=>$r['desconto_cartao'],
            ];
        }
        foreach(self::CODES as $required){
            if(!isset($rules[$required]))throw new \RuntimeException('Regra automática não configurada: '.$required);
            $mode=str_starts_with($required,'AVISTA')?'AVISTA':$required;
            if($rules[$required]['modalidade']!==$mode) {
                throw new \RuntimeException('Regra automática incompatível: '.$required);
            }
        }
        return $rules;
    }

    /** @return array{code: ?string, valor: ?string, aviso: string, rule: ?array} */
    public static function calculate(array $configs,array $movements,int $price,int $table,int $discount,bool $historical): array
    {
        $paid=0;$credit=0;$noncredit=0;
        foreach($movements as $movement){
            $value=VendaMoney::cents((string)$movement['valor'],true);
            if($value===null)throw new \InvalidArgumentException('Valor de recebimento inválido.');
            $signed=$movement['tipo']==='ENTRADA'?$value:-$value;
            $paid+=$signed;
            if((bool)$movement['credito'])$credit+=$signed;
            else $noncredit+=$signed;
        }
        if($paid<0 || $credit<0 || $noncredit<0) {
            return ['code'=>null,'valor'=>null,'rule'=>null,
                'aviso'=>'Inconsistência nos recebimentos. Verifique estornos e devoluções.'];
        }
        if($paid!==$price){
            return ['code'=>null,'valor'=>null,'rule'=>null,
                'aviso'=>$paid===0
                  ? 'Aguardando pagamento do cliente para calcular a comissão automaticamente.'
                  : 'Pagamento parcial: a comissão será calculada após a quitação do título.'];
        }
        if($credit>0 && $noncredit>0)$code='MISTO';
        elseif($credit>0)$code='CARTAO';
        else $code=$historical?'AVISTA_HISTORICA':'AVISTA_ATUAL';

        $rule=$configs[$code]??null;
        if(!$rule)throw new \RuntimeException('Regra automática não encontrada: '.$code);
        $estimate=VendaMoney::estimate($rule,$table,$noncredit,$discount);
        return ['code'=>$code,'valor'=>$estimate['valor'],'rule'=>$rule,
            'aviso'=>$estimate['aviso'] ?? 'Regra aplicada automaticamente conforme o pagamento do cliente: '.$rule['nome'].'.'];
    }
}
