import {useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Camera from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import {router} from 'expo-router';
import {useAuth} from './AuthContext';
import {apiRequest} from './api';
import {getNativePushToken} from './pushDevice';

/**
 * As notificações precisam aparecer mesmo com o aplicativo aberto.
 * No segundo plano, o Android mostra os avisos enviados pelo FCM.
 */
Notifications.setNotificationHandler({
  handleNotification:async()=>({
    shouldShowBanner:true,
    shouldShowList:true,
    shouldPlaySound:true,
    shouldSetBadge:true,
  }),
});

const NOTIFICATION_ASKED='splash.permission.notifications.asked.v1';
const CAMERA_ASKED='splash.permission.camera.asked.v1';

async function channels(){
  if(Platform.OS!=='android')return;
  await Notifications.setNotificationChannelAsync('splash_avisos',{
    name:'Avisos Splash',importance:Notifications.AndroidImportance.HIGH,
    sound:'default',vibrationPattern:[0,250,160,250],
  });
  await Notifications.setNotificationChannelAsync('splash_venda_paga',{
    name:'Vendas e pagamentos',importance:Notifications.AndroidImportance.MAX,
    sound:'default',vibrationPattern:[0,350,170,350],
  });
}

/**
 * Dispara os dois pedidos na primeira abertura, um depois do outro.
 * A recusa de qualquer um NÃO impede login, vendas, consultas e cadastros.
 */
async function startupPermissions(){
  await channels().catch(()=>{});
  try{
    const prior=await SecureStore.getItemAsync(NOTIFICATION_ASKED);
    const existing=await Notifications.getPermissionsAsync();
    if(!prior&&!existing.granted&&existing.canAskAgain){
      await SecureStore.setItemAsync(NOTIFICATION_ASKED,'1');
      await Notifications.requestPermissionsAsync();
    }
  }catch{/* Funcionalidades sem permissão permanecem disponíveis. */}
  try{
    const prior=await SecureStore.getItemAsync(CAMERA_ASKED);
    const existing=await Camera.getCameraPermissionsAsync();
    if(!prior&&!existing.granted&&existing.canAskAgain){
      await SecureStore.setItemAsync(CAMERA_ASKED,'1');
      await Camera.requestCameraPermissionsAsync();
    }
  }catch{/* O app continua funcionando sem câmera. */}
}

/**
 * Vincula o token FCM à identidade autenticada. Quando o usuário troca de
 * conta no mesmo aparelho, o backend move o mesmo token para a nova conta.
 */
export default function NativePermissionsAndPush(){
  const {user,token,ready}=useAuth();
  const [asked,setAsked]=useState(false);
  const lastToken=useRef('');
  useEffect(()=>{
    let mounted=true;
    void startupPermissions().finally(()=>{if(mounted)setAsked(true);});
    return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(!ready||!user||!token||!asked||Platform.OS!=='android')return;
    let mounted=true;
    const register=async(force=false)=>{
      const fcm=await getNativePushToken();
      if(!mounted||!fcm)return;
      const id=String(user.id)+':'+fcm;
      if(!force&&lastToken.current===id)return;
      try{
        await apiRequest('mobile/notificacoes/dispositivo',{
          method:'POST',token,body:{plataforma:'android',token:fcm},
        });
        if(mounted)lastToken.current=id;
      }catch{
        // Erros de conexão/Firebase não bloqueiam o aplicativo.
        // O próximo retorno ao primeiro plano tenta novamente.
      }
    };
    void register();
    const foreground=AppState.addEventListener('change',state=>{
      if(state==='active')void register(true);
    });
    const changed=Notifications.addPushTokenListener(()=>{
      lastToken.current='';
      void register(true);
    });
    return()=>{
      mounted=false;
      foreground.remove();
      changed.remove();
    };
  },[asked,ready,token,user?.id]);

  // Tocar no push abre a central interna correspondente à conta logada.
  // As telas individuais continuam autorizadas pelo backend.
  useEffect(()=>{
    if(!ready||!user)return;
    let active=true;
    const open=()=>{
      if(!active)return;
      router.push('/notificacoes');
      Notifications.clearLastNotificationResponse();
    };
    const response=Notifications.getLastNotificationResponse();
    if(response){
      const timer=setTimeout(open,200);
      const listener=Notifications.addNotificationResponseReceivedListener(open);
      return()=>{active=false;clearTimeout(timer);listener.remove();};
    }
    const listener=Notifications.addNotificationResponseReceivedListener(open);
    return()=>{active=false;listener.remove();};
  },[ready,user?.id]);
  return null;
}

