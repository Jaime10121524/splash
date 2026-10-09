<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Validação única do cadastro completo e da entrada rápida de clientes.
 * A corrente do indicado é herdada do cliente que fez a indicação.
 */
final class ClienteRules
{
    public static function validate($db, array $input, ?array $existing=null): array
    {
        $cleanString=static function($value,int $limit,bool $required=false): string|false|null {
            if ($value!==null && !is_string($value) && !is_numeric($value)) return false;
            $text=trim((string)$value);
            if (($required && $text==='') || mb_strlen($text)>$limit) return false;
            return $text==='' ? null : $text;
        };
        $name=$cleanString($input['nome']??null,160,true);
        $phoneDigits=preg_replace('/\D+/','',(string)($input['telefone']??''));
        $cpfDigits=preg_replace('/\D+/','',(string)($input['cpf']??''));
        $email=$cleanString($input['email']??null,254);
        $address=$cleanString($input['endereco']??null,3000);
        $occupation=$cleanString($input['profissao']??null,100);
        $notes=$cleanString($input['observacoes']??null,3000);
        if ($name===false) return ['error'=>'Informe o nome do cliente (até 160 caracteres).'];
        if (strlen($phoneDigits)<8 || strlen($phoneDigits)>15) {
            return ['error'=>'Informe um telefone válido com DDD.'];
        }
        if ($cpfDigits!=='' && !self::cpfValid($cpfDigits)) {
            return ['error'=>'CPF inválido. Confira os números.'];
        }
        if ($email===false || ($email!==null && !filter_var($email,FILTER_VALIDATE_EMAIL))) {
            return ['error'=>'Informe um e-mail válido ou deixe em branco.'];
        }
        if ($address===false || $occupation===false || $notes===false) {
            return ['error'=>'Endereço, profissão ou observações ultrapassam o limite permitido.'];
        }

        $birthday=$input['data_nascimento']??null;
        if ($birthday==='') $birthday=null;
        if ($birthday!==null) {
            $dt=is_string($birthday) ? \DateTimeImmutable::createFromFormat('!Y-m-d',$birthday) : false;
            if (!$dt || $dt->format('Y-m-d')!==$birthday || $birthday>date('Y-m-d')
                || (int)$dt->format('Y')<1900) return ['error'=>'Data de nascimento inválida.'];
        }

        $originId=self::optionalId($input['origem_id']??null);
        $referrerId=self::optionalId($input['indicador_cliente_id']??null);
        $ownerId=self::optionalId($input['dono_corrente_pessoa_id']??null);

        if ($originId===false || $referrerId===false || $ownerId===false) {
            return ['error'=>'Origem, indicação ou dono da corrente inválido.'];
        }
        if ($existing===null && $originId===null) {
            return ['error'=>'Informe a origem do lead. Quando não souber, escolha Outro.'];
        }
        if ($originId!==null && !$db->table('lead_origens')->where('id',$originId)->countAllResults()) {
            return ['error'=>'Origem do lead não encontrada.'];
        }

        $changedReferral = $existing===null
            || $referrerId!==(isset($existing['indicador_cliente_id']) && $existing['indicador_cliente_id']!==null
                ? (int)$existing['indicador_cliente_id'] : null);

        if ($referrerId!==null) {
            if ($existing!==null && $referrerId===(int)$existing['id']) {
                return ['error'=>'Um cliente não pode indicar a si mesmo.'];
            }
            $referrer=$db->table('clientes')->where('id',$referrerId)->get()->getRowArray();
            if (!$referrer) return ['error'=>'Cliente indicador não encontrado.'];
            if ($existing!==null && self::causesCycle($db,(int)$existing['id'],$referrerId)) {
                return ['error'=>'Essa indicação criaria uma corrente circular.'];
            }
            if ($changedReferral) {
                $ownerId=(int)$referrer['dono_corrente_pessoa_id'];
            } elseif ($existing!==null && $ownerId===null) {
                $ownerId=(int)$existing['dono_corrente_pessoa_id'];
            }
        }
        if ($ownerId===null) {
            return ['error'=>'Escolha o dono da corrente. No caso de indicação, selecione o cliente indicador.'];
        }
        $owner=$db->table('pessoas')->where('id',$ownerId)->get()->getRowArray();
        if (!$owner) return ['error'=>'O dono da corrente não está cadastrado.'];
        if ((!$existing || (int)$existing['dono_corrente_pessoa_id']!==$ownerId)
            && !(bool)$owner['ativo']) {
            return ['error'=>'O dono da corrente precisa estar ativo.'];
        }
        if ($existing!==null && !$changedReferral
            && (int)$existing['dono_corrente_pessoa_id']!==$ownerId) {
            $reason=$cleanString($input['motivo_corrente']??null,300,true);
            if ($reason===false || mb_strlen((string)$reason)<5) {
                return ['error'=>'Para mudar o dono da corrente, informe a justificativa (mínimo 5 caracteres).'];
            }
        }
        if ($cpfDigits!=='') {
            $lookup=$db->table('clientes')->where('cpf',$cpfDigits);
            if ($existing!==null) $lookup->where('id !=',(int)$existing['id']);
            if ($lookup->countAllResults()>0) {
                return ['error'=>'Este CPF já pertence a outro cliente. Procure o cadastro existente.'];
            }
        }

        if (!array_key_exists('ativo',$input) || !is_bool($input['ativo'])) {
            return ['error'=>'Informe a situação do cadastro.'];
        }

        return [
            'nome'=>$name,'telefone'=>$phoneDigits,'cpf'=>$cpfDigits?:null,
            'email'=>$email,'data_nascimento'=>$birthday,'endereco'=>$address,
            'profissao'=>$occupation,'observacoes'=>$notes,
            'origem_id'=>$originId,'indicador_cliente_id'=>$referrerId,
            'dono_corrente_pessoa_id'=>$ownerId,'ativo'=>$input['ativo']?1:0,
        ];
    }

    private static function optionalId($raw): int|false|null
    {
        if ($raw===null || $raw==='')return null;
        $id=filter_var($raw,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        return $id===false?false:(int)$id;
    }

    private static function causesCycle($db,int $clientId,int $referrerId): bool
    {
        $visited=[];
        while ($referrerId>0) {
            if ($referrerId===$clientId || isset($visited[$referrerId])) return true;
            $visited[$referrerId]=true;
            $row=$db->table('clientes')->select('indicador_cliente_id')
                ->where('id',$referrerId)->get()->getRowArray();
            if (!$row || !$row['indicador_cliente_id'])break;
            $referrerId=(int)$row['indicador_cliente_id'];
        }
        return false;
    }

    private static function cpfValid(string $cpf): bool
    {
        if(strlen($cpf)!==11 || preg_match('/^(\d)\1{10}$/',$cpf))return false;
        for($length=9;$length<11;$length++){
            $sum=0;
            for($i=0;$i<$length;$i++)$sum+=(int)$cpf[$i]*($length+1-$i);
            $digit=($sum*10)%11;
            if($digit===10)$digit=0;
            if((int)$cpf[$length]!==$digit)return false;
        }
        return true;
    }
}
