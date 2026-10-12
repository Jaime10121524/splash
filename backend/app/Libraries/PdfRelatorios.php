<?php
declare(strict_types=1);

namespace App\Libraries;

use Mpdf\Mpdf;

/**
 * PDF A4 gerado no servidor: sem CSS da SPA, impressora do navegador ou assets externos.
 * Recebe apenas respostas já autorizadas pelos controllers dos relatórios.
 */
final class PdfRelatorios
{
    private const PURPLE='#7157e7';
    private const INK='#18213a';

    private static function h(mixed $v):string
    {
        return htmlspecialchars((string)($v??''),ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    }

    private static function cash(mixed $amount):string
    {
        if($amount===null||$amount==='')return 'A apurar';
        if(!is_numeric($amount))return self::h($amount);
        return 'R$ '.number_format((float)$amount,2,',','.');
    }

    private static function day(mixed $date):string
    {
        if(!$date)return '—';
        $raw=(string)$date;
        if(preg_match('/^(\d{4})-(\d{2})-(\d{2})/',$raw,$m)){
            return $m[3].'/'.$m[2].'/'.$m[1];
        }
        return self::h($raw);
    }

    private static function section(string $heading,?string $description=null):string
    {
        return '<div class="section-title">'.self::h($heading).'</div>'.
            ($description!==null?'<div class="subnote">'.self::h($description).'</div>':'');
    }

    private static function metric(string $label,mixed $value):string
    {
        return '<td class="metric"><div class="metric-label">'.self::h($label).
            '</div><div class="metric-value">'.self::cash($value).'</div></td>';
    }

    private static function metrics(array $items,int $columns=3):string
    {
        $html='<table class="metrics"><tbody>';
        foreach(array_chunk($items,$columns) as $row){
            $html.='<tr>';
            foreach($row as $pair)$html.=self::metric($pair[0],$pair[1]);
            for($j=count($row);$j<$columns;$j++)$html.='<td class="metric empty"></td>';
            $html.='</tr>';
        }
        return $html.'</tbody></table>';
    }

    private static function table(array $headers,array $rows,array $moneyColumns=[]):string
    {
        $html='<table class="report-table"><thead><tr>';
        foreach($headers as $key=>$head){
            $right=in_array($key,$moneyColumns,true);
            $html.='<th'.($right?' class="num"':'').'>'.self::h($head).'</th>';
        }
        $html.='</tr></thead><tbody>';
        if(!$rows){
            $html.='<tr><td colspan="'.count($headers).'" class="empty-msg">Nenhum registro no período.</td></tr>';
        }else{
            foreach($rows as $row){
                $html.='<tr>';
                foreach($headers as $key=>$head){
                    $right=in_array($key,$moneyColumns,true);
                    $value=$row[$key]??'';
                    $formatted=$right?self::cash($value):self::h($value);
                    $html.='<td'.($right?' class="num"':'').'>'.$formatted.'</td>';
                }
                $html.='</tr>';
            }
        }
        return $html.'</tbody></table>';
    }

    private static function pdf(string $heading,string $subtitle,string $body,string $orientation='P'):string
    {
        if(!class_exists(Mpdf::class)){
            throw new \RuntimeException('Biblioteca mPDF ausente. Instale dependências Composer do backend.');
        }
        $folder=WRITEPATH.'cache/splash-pdf';
        if(!is_dir($folder) && !mkdir($folder,0770,true) && !is_dir($folder)){
            throw new \RuntimeException('Diretório temporário PDF sem permissão de escrita.');
        }
        $mpdf=new Mpdf([
            'mode'=>'utf-8','format'=>'A4','orientation'=>$orientation,
            'margin_left'=>12,'margin_right'=>12,'margin_top'=>29,
            'margin_bottom'=>18,'margin_header'=>7,'margin_footer'=>9,
            'tempDir'=>$folder,'default_font'=>'dejavusans','font_size'=>9,
        ]);
        $mpdf->SetTitle('SPLASH - '.$heading);
        $mpdf->SetAuthor('SPLASH · Ahritech');
        $mpdf->SetDisplayMode('fullwidth');
        $mpdf->SetHTMLHeader('<table width="100%" style="font-family:dejavusans;border-collapse:collapse;border-bottom:1px solid #ddd9ee;">
          <tr><td style="padding:4px 0 7px;color:#7157e7;font-weight:bold;font-size:13pt;">SPLASH<span style="font-size:9pt;color:#9298ad;"> / AHRITECH</span></td>
          <td style="text-align:right;font-size:8pt;color:#757b8e;">GESTÃO DE TÍTULOS · RELATÓRIOS</td></tr></table>');
        $mpdf->SetHTMLFooter('<table width="100%" style="border-top:1px solid #dedee8;padding-top:7px;font-family:dejavusans;font-size:8pt;color:#81869a;">
          <tr><td>SPLASH · Documento gerado em '.date('d/m/Y H:i').'</td>
          <td style="text-align:right;">Página {PAGENO} de {nbpg}</td></tr></table>');
        $css='
            body{font-family:dejavusans;color:#18213a;font-size:9pt;line-height:1.4}
            h1{font-size:18pt;color:#18213a;margin:0 0 4mm;font-weight:bold}
            .intro{font-size:9pt;color:#69728c;margin:0 0 7mm}
            .section-title{font-size:11pt;color:#302154;font-weight:bold;border-left:3px solid #7157e7;padding:2mm 0 2mm 3mm;margin:7mm 0 3mm}
            .subnote{font-size:8pt;color:#81869a;margin:0 0 3mm}
            .metrics{border-collapse:separate;border-spacing:2mm;width:100%;margin:0 0 2mm;table-layout:fixed}
            .metric{background:#f3f1ff;border:1px solid #e7e1fe;padding:3.8mm;vertical-align:top}
            .metric-label{font-size:8pt;color:#625e78}
            .metric-value{font-size:13pt;font-weight:bold;color:#403292;margin-top:1.2mm;white-space:nowrap}
            .metric.empty{background:white;border:0}
            .report-table{width:100%;border-collapse:collapse;margin:1mm 0 5mm;table-layout:fixed}
            .report-table th{background:#ece9ff;border-bottom:1px solid #d9d1f8;color:#3e326d;text-align:left;font-size:8pt;font-weight:bold;padding:2.5mm 2.3mm}
            .report-table td{font-size:8pt;color:#30364e;border-bottom:1px solid #ebedf3;padding:2.5mm 2.3mm;vertical-align:top;overflow-wrap:break-word}
            .report-table tbody tr:nth-child(even) td{background:#fafaff}
            .report-table tr{page-break-inside:avoid}
            .report-table th.num,.report-table td.num{text-align:right;white-space:nowrap}
            .empty-msg{text-align:center;color:#8c8fa3;padding:6mm!important}
            .person-title{color:#18213a;font-size:10pt;font-weight:bold;margin:5mm 0 1mm;page-break-after:avoid}
            .person-sub{font-size:8pt;color:#68738e;margin-bottom:2mm}
            .person-stats{width:100%;border-collapse:collapse;margin:1mm 0 3mm}
            .person-stats td{width:25%;padding:2mm 2.5mm;background:#f7f7fc;border:1px solid #e7e7f2;font-size:8pt}
            .person-stats strong{font-size:9pt;color:#403292}
            .note{font-size:8pt;color:#737b91;margin:5mm 0;line-height:1.5}
        ';
        $mpdf->WriteHTML($css,\Mpdf\HTMLParserMode::HEADER_CSS);
        $html='<h1>'.self::h($heading).'</h1><p class="intro">'.self::h($subtitle).'</p>'.$body;
        $mpdf->WriteHTML($html,\Mpdf\HTMLParserMode::HTML_BODY);
        return $mpdf->Output('',\Mpdf\Output\Destination::STRING_RETURN);
    }

    public static function gerencial(array $report):string
    {
        $titles=[
            'VENDAS'=>'Vendas por período',
            'COMISSOES'=>'Comissões por pessoa',
            'ATENDIMENTOS'=>'Atendimentos',
            'PENDENCIAS'=>'Pendências e retornos',
            'TITULOS'=>'Títulos a vencer',
        ];
        $type=(string)($report['tipo']??'');
        if(!isset($titles[$type]))throw new \InvalidArgumentException('Tipo de relatório inválido.');
        $source=$report['linhas']??[];
        if(!is_array($source))$source=[];
        $headers=array_keys($source[0]??[]);
        $money=['Valor da venda','Comissão bruta','Valor previsto','Comissões','Liquidado','A receber'];
        $body=self::section('Resultado da consulta',count($source).' registro(s) encontrado(s)');
        if($source){
            $sum=0;$have=false;
            $key=match($type){
                'VENDAS'=>'Valor da venda','COMISSOES'=>'Comissões',
                'PENDENCIAS'=>'Valor previsto',default=>null,
            };
            if($key!==null){
                foreach($source as $entry)if(is_numeric($entry[$key]??null)){
                    $have=true;$sum+=(float)$entry[$key];
                }
                if($have)$body.=self::metrics([['Total de '.$key,$sum]],1);
            }
            $body.=self::table(array_combine($headers,$headers),$source,$money);
        }else{
            $body.='<p class="note">Nenhum registro encontrado para os filtros informados.</p>';
        }
        if(!empty($report['truncado']))$body.='<p class="note">Consulta limitada a 1.000 registros. Reduza o período para consultar todos.</p>';
        return self::pdf($titles[$type],
            'Período: '.self::day($report['inicio']??null).' a '.self::day($report['fim']??null).
            '   ·   Relatório administrativo',$body,'L');
    }

    public static function acerto(array $report):string
    {
        $admin=!empty($report['administrador']);
        $period=$report['fechamento']??[];
        $people=$report['pessoas']??[];
        $title=$admin?'Acerto semanal de comissões':'Demonstrativo individual de comissões';
        $sub='Fechamento #'.($period['id']??'—').'   ·   '.
            self::day($period['inicio']??null).' a '.self::day($period['fim']??null);
        if($admin && !empty($period['responsavel_nome']))$sub.='   ·   Responsável: '.$period['responsavel_nome'];

        $html='';
        if($admin){
            $s=$report['resumo']??[];
            $html.=self::section('Resumo financeiro','Valores efetivamente registrados no fechamento');
            $html.=self::metrics([
                ['Comissões brutas',$s['comissoes']??0],
                ['Recebido do clube',$s['recebido_clube']??0],
                ['Pagamentos realizados',$s['pagamentos_periodo']??0],
                ['Abatimento de dívidas',$s['abatido_dividas']??0],
                ['Despesas registradas',$s['despesas']??0],
                ['Saldo das entradas',$s['saldo_caixa_registrado']??0],
            ]);
        }
        $t=['total'=>0,'recebido'=>0,'abatido'=>0,'pendente'=>0];
        foreach($people as $p){
            foreach($t as $key=>$value)$t[$key]+=(float)($p['resumo'][$key]??0);
        }
        $html.=self::section($admin?'Comissões por pessoa':'Minhas comissões',
            count($people).' participante(s) neste fechamento');
        $html.=self::metrics([
            ['Total de direitos',$t['total']],['Recebido em dinheiro',$t['recebido']],
            ['Abatido em empréstimos',$t['abatido']],['Ainda a receber',$t['pendente']],
        ],2);
        $roles=['TITULAR'=>'Corretor titular','CORRETOR'=>'Segundo corretor',
            'ATENDENTE'=>'Atendimento','GERENTE'=>'Gerência'];
        foreach($people as $p){
            $sum=$p['resumo']??[];
            $html.='<div class="person-title">'.self::h($p['nome']??'Participante').'</div>';
            $html.='<div class="person-sub">Total de direitos: '.self::cash($sum['total']??0).
                '   ·   Liquidado: '.self::cash($sum['liquidado']??0).
                '   ·   A receber: '.self::cash($sum['pendente']??0).'</div>';
            $rows=[];
            foreach(($p['itens']??[]) as $item){
                $rows[]=[
                    'titulo'=>(string)($item['titulo']??('#'.($item['operacao_id']??''))),
                    'data'=>self::day($item['data']??null),
                    'papel'=>$roles[$item['papel']??'']??'Participação',
                    'valor'=>$item['valor']??0,
                    'recebido'=>$item['recebido']??0,
                    'abatido'=>$item['abatido']??0,
                    'pendente'=>$item['pendente']??0,
                ];
            }
            $html.=self::table(['titulo'=>'Título','data'=>'Venda',
                'papel'=>'Participação','valor'=>'Ganhou','recebido'=>'Recebido',
                'abatido'=>'Abatido','pendente'=>'A receber'],$rows,
                ['valor','recebido','abatido','pendente']);
        }
        if($admin){
            $sales=$report['vendas']??[];
            $html.=self::section('Vendas do fechamento',count($sales).' venda(s) incluída(s)');
            $rows=[];
            foreach($sales as $sale){
                $rows[]=[
                    'titulo'=>$sale['titulo']??('#'.($sale['operacao_id']??'')),
                    'data'=>self::day($sale['data']??null),
                    'cliente'=>$sale['cliente_nome']??'',
                    'corretor'=>$sale['titular_nome']??'',
                    'bruta'=>$sale['bruta']??0,
                    'propria'=>$sale['parte_propria']??0,
                ];
            }
            $html.=self::table(['titulo'=>'Título','data'=>'Venda','cliente'=>'Cliente',
                'corretor'=>'Titular','bruta'=>'Comissão bruta','propria'=>'Parte própria'],
                $rows,['bruta','propria']);
            $entries=[];
            foreach(($report['entradas']??[]) as $entry){
                $entries[]=['data'=>self::day($entry['data_recebimento']??null),
                    'corretor'=>$entry['corretor_nome']??'',
                    'forma'=>$entry['forma']??'','valor'=>$entry['valor']??0];
            }
            $html.=self::section('Recebimentos do clube','Estes valores não representam pagamentos pessoais.');
            $html.=self::table(['data'=>'Data','corretor'=>'Corretor',
                'forma'=>'Forma','valor'=>'Valor recebido'],$entries,['valor']);
        }else{
            $html.=self::section('Informações financeiras próprias');
            $html.=self::metrics([
                ['Minhas despesas no período',$report['despesas_proprias']??0],
                ['Abatimentos de comissão',$t['abatido']],
            ],2);
            $loans=[];
            foreach(($report['emprestimos_proprios']??[]) as $loan){
                $loans[]=['numero'=>'#'.($loan['id']??''),'descricao'=>$loan['descricao']??'',
                    'valor'=>$loan['valor']??0,'saldo'=>$loan['saldo']??0];
            }
            if($loans)$html.=self::table(['numero'=>'Empréstimo','descricao'=>'Descrição',
                'valor'=>'Valor original','saldo'=>'Saldo restante'],$loans,['valor','saldo']);
        }
        $html.='<p class="note">'.self::h($report['aviso']??'Documento de consulta do SPLASH.').'</p>';
        return self::pdf($title,$sub,$html,$admin?'L':'P');
    }
}
