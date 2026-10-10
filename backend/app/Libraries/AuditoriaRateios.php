<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Comparação somente leitura entre comissão bruta de uma venda e os direitos
 * por pessoa usados no extrato financeiro. Todos os valores em centavos.
 */
final class AuditoriaRateios
{
    public static function analisar(int $bruta,int $titularId,array $rateios,int $titularPago=0): array
    {
        $distribuidos=0;
        $todos=0;
        $problemas=[];
        $pessoas=[];
        foreach($rateios as $r){
            $valor=(int)$r['valor_cent'];
            $pago=(int)($r['pago_cent']??0);
            $responsavel=(int)$r['responsavel_pessoa_id'];
            $beneficiario=(int)$r['beneficiario_pessoa_id'];
            $todos+=$valor;
            if($responsavel===$titularId)$distribuidos+=$valor;
            else $problemas[]='Rateio #'.(int)$r['id'].' possui responsável diferente do titular da venda.';
            if($valor<=0 || $pago<0 || $pago>$valor){
                $problemas[]='Rateio #'.(int)$r['id'].' tem valor ou pagamento incompatível.';
            }
            $pessoas[]=[
                'pessoa_id'=>$beneficiario,
                'nome'=>(string)$r['beneficiario_nome'],
                'funcao'=>match((string)$r['papel']){
                    'ATENDENTE'=>'Atendimento',
                    'GERENTE'=>'Gerência',
                    'CORRETOR'=>'Divisão de corretagem',
                    default=>'Participação',
                },
                'valor_cent'=>$valor,'pago_cent'=>$pago,
                'pendente_cent'=>max(0,$valor-$pago),
            ];
        }
        $proprio=$bruta-$distribuidos;
        if($proprio<0)$problemas[]='Os rateios do titular ultrapassam a comissão bruta.';
        if($titularPago<0 || $titularPago>$proprio){
            $problemas[]='Pagamento da comissão própria incompatível com o direito do titular.';
        }
        // Reproduz exatamente a composição de créditos do Financeiro:
        // parte própria + TODAS as participações ligadas à venda.
        $créditos=$proprio+$todos;
        if($créditos!==$bruta)$problemas[]='Distribuição dos direitos difere da comissão bruta.';
        return [
            'bruta_cent'=>$bruta,
            'parte_propria_cent'=>$proprio,
            'titular_pago_cent'=>$titularPago,
            'rateios_cent'=>$todos,
            'creditos_financeiro_cent'=>$créditos,
            'diferenca_cent'=>$créditos-$bruta,
            'pessoas'=>$pessoas,
            'problemas'=>array_values(array_unique($problemas)),
        ];
    }
}
