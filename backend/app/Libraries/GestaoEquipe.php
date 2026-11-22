<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Permissao de gestao comercial, independente do recebedor no fechamento.
 * A relacao é cadastrada no modulo Pessoas (corretor -> gestor).
 * Nunca aceita IDs de equipe informados pelo cliente.
 */
final class GestaoEquipe
{
    public static function pessoaId($db, $user): ?int
    {
        $p=$db->table('pessoas')->select('id')
            ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
        return $p?(int)$p['id']:null;
    }

    /** IDs da pessoa logada e dos corretores geridos. */
    public static function ids($db, $user): array
    {
        $own=self::pessoaId($db,$user);
        if($own===null)return [];
        $ids=[$own];
        if($user->inGroup('gerente')){
            foreach($db->table('gestor_corretores')->select('corretor_pessoa_id')
                ->where('gestor_pessoa_id',$own)->get()->getResultArray() as $link){
                $ids[]=(int)$link['corretor_pessoa_id'];
            }
        }
        return array_values(array_unique($ids));
    }

    public static function podeGerirOperacao($db,$user,array $op): bool
    {
        if($user->inGroup('admin'))return true;
        $ids=self::ids($db,$user);
        if(!$ids)return false;
        $own=(int)$ids[0];
        return in_array((int)($op['corretor_pessoa_id']??0),$ids,true)
            || in_array((int)($op['segundo_corretor_pessoa_id']??0),$ids,true)
            || (int)($op['gerente_pessoa_id']??0)===$own
            || (int)($op['criado_por_usuario_id']??0)===(int)$user->id;
    }
}
