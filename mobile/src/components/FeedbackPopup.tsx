import {useEffect} from 'react';
import * as Haptics from 'expo-haptics';
import ActionModal from './ActionModal';

/** Retorno visível no centro da tela, mesmo quando o usuário salvou no rodapé. */
export default function FeedbackPopup({error='',success='',onDismiss}:{
  error?:string;success?:string;onDismiss:()=>void;
}){
  const isError=!!error;
  const message=isError?error:success;
  useEffect(()=>{
    if(!message)return;
    void Haptics.notificationAsync(isError
      ?Haptics.NotificationFeedbackType.Error:Haptics.NotificationFeedbackType.Success).catch(()=>{});
  },[message,isError]);
  return <ActionModal visible={!!message} variant={isError?'error':'success'}
    title={isError?'Não foi possível concluir':'Operação realizada'}
    description={message}
    primaryLabel={isError?'Corrigir':'Continuar'} secondaryLabel={null}
    onPrimary={onDismiss}/>;
}
