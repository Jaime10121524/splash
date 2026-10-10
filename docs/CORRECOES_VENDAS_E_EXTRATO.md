# SPLASH — Correções seguras de vendas e entendimento do extrato

## O que é saldo a receber?
É apenas o valor do TÍTULO que o CLIENTE ainda não pagou:
**preço cobrado pelo título - entradas de cliente + devoluções reais + estornos de entradas equivocadas**.

Não é saldo de comissão do corretor nem valor devido pelo clube.
A comissão prevista/ajustada não equivale a dinheiro repassado; pagamentos de comissão, acertos com clube, participação de atendente e gerente, empréstimos e fechamento dominical terão extrato próprio na próxima etapa.

## Exemplo de teste
Plano de R$ 1.176,00. Entrada de R$ 360,00 via Pix:
- Cliente já pagou: R$ 360,00
- Falta o cliente pagar: R$ 816,00
- Regra mista sobre R$ 1.176,00: base 1/3 = R$ 392,00.
- Pix de R$ 360 cobre os primeiros R$ 360 de comissão; 8% somente dos R$ 32 restantes -> saldo R$ 29,44 e comissão estimada R$ 389,44.
- Esse valor **não** significa que toda a comissão foi paga.

## Editar cadastro x estornar x devolver
1. **Editar cadastro:** no extrato, botão Editar cadastro quando não há movimentação efetiva nem comissão ajustada. Permite alterar plano/versão, regra, desconto, número e datas do título, corretores (conforme atendimento), retorno e observações. Não altera cliente nem vínculo de visita. Exige justificativa. O servidor mantém antes/depois e quem corrigiu em `venda_operacoes_auditoria`.
2. **Estornar lançamento:** use somente quando registrou por engano uma ENTRADA que não existiu ou foi digitada errada (valor, forma ou detentor). O sistema cria uma linha ESTORNO vinculada, com motivo, sem apagar a entrada e **sem supor que o dinheiro foi devolvido**. Depois cadastre a entrada correta. O estorno atual abate integralmente o saldo da entrada, respeitando devoluções/estornos já existentes.
3. **Devolver dinheiro:** use exclusivamente se houve devolução real ao cliente. Registre valor, data e motivo, vinculado à entrada original. O extrato mostrará DEVOLUÇÃO (não ESTORNO).
4. **Edição depois do estorno:** somente se todas as entradas estiverem integralmente estornadas, não houver devolução real e a comissão não tiver sido ajustada. Nunca estorne pagamentos que realmente ocorreram apenas para desbloquear cadastro; casos com pagamento real exigem correção supervisionada, não alteração silenciosa da comissão.
5. **Pendência para venda:** a conversão mantém a mesma operação, os pagamentos e seus vínculos. Não recadastre a venda por cima.

## Segurança e limitações
- A API de vendas continua exclusiva do administrador; não basta esconder botões.
- Os lançamentos antigos são preservados, não há operação DELETE.
- As devoluções descontam o que já foi estornado; não é possível devolver além do saldo da entrada.
- Estorno não movimenta dinheiro físico; também não representa transferência ao clube.
- Não existe ainda cancelamento completo de venda com controle de comissão distribuída nem edição de dados financeiros quando já há recebimento verdadeiro. Não simule estorno em pagamentos reais apenas para editar.

## Atualização no Windows
```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
cd ..\frontend
npm.cmd run build
```
Não execute `migrate:refresh`. A nova migration `2026-10-10-000006_AuditoriaCorrecaoOperacoes.php` adiciona exclusivamente a tabela de auditoria e preserva tudo que já foi lançado.

## Testes
1. Crie venda de teste sem entrada -> Extrato -> Editar cadastro, alterar dados com justificativa.
2. Registre Pix fictício -> não permite alterar condições da venda enquanto houver entrada válida.
3. Extrato -> Estornar lançamento, confirmar motivo -> valor pago do cliente diminui, mesmo registro de entrada aparece junto ao estorno.
4. Depois do estorno total, Editar cadastro volta a ficar disponível.
5. Registrar Pix real e fazer DEVOLUÇÃO real, com motivo. Confirme que foi tratada separadamente de um estorno.
6. Não deve ser possível devolver mais que o saldo não estornado/devolvido de uma entrada.
7. Entre como corretor sem permissão administrativa: API de vendas responde 403.
