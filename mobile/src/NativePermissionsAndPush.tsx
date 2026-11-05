import {useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {useCameraPermissions} from 'expo-camera';
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
async function startupPermissions(
  getCameraPermission:()=>Promise<{granted:boolean;canAskAgain:boolean}>,
  requestCameraPermission:()=>Promise<{granted:boolean;canAskAgain:boolean}>,
){
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
    const existing=await getCameraPermission();
    if(!prior&&!existing.granted&&existing.canAskAgain){
      await SecureStore.setItemAsync(CAMERA_ASKED,'1');
      await requestCameraPermission();
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
  const [,requestCameraPermission,getCameraPermission]=useCameraPermissions();
  const permissionJob=useRef<Promise<void>|null>(null);
  const lastToken=useRef('');
  const activeUserId=useRef('');
  const lastRegisterAt=useRef(0);
  const pushBusy=useRef(false);
  const tokenLookupBusy=useRef(false);
  useEffect(()=>{
    // Uma unica solicitação, mesmo se o hook da câmera trocar callbacks
    // ou o React remontar efeitos em desenvolvimento.
    let mounted=true;
    if(!permissionJob.current){
      permissionJob.current=startupPermissions(getCameraPermission,requestCameraPermission);
    }
    void permissionJob.current.finally(()=>{if(mounted)setAsked(true);});
    return()=>{mounted=false;};
  },[getCameraPermission,requestCameraPermission]);

  useEffect(()=>{
    if(!ready||!user||!token||!asked||Platform.OS!=='android')return;
    let mounted=true;
    // Ao trocar de usuário, registrar imediatamente para evitar pushes na
    // conta anterior (sem herdar o cooldown da sessão encerrada).
    if(activeUserId.current!==String(user.id)){
      activeUserId.current=String(user.id);
      lastToken.current='';
      lastRegisterAt.current=0;
    }
    // Cada telefone sincroniza com a API apenas ao entrar na conta, quando
    // seu token muda ou apos 15 minutos no primeiro plano. Falhas aguardam
    // pelo menos 2 minutos. Sem chamadas concorrentes.
    const registerValue=async(fcm:string,changed=false)=>{
      if(!mounted||!fcm||pushBusy.current)return;
      const id=String(user.id)+':'+fcm;
      const elapsed=Date.now()-lastRegisterAt.current;
      if(lastToken.current===id && elapsed<15*60*1000)return;
      if(!changed && elapsed<2*60*1000)return;
      pushBusy.current=true;
      lastRegisterAt.current=Date.now();
      try{
        await apiRequest('mobile/notificacoes/dispositivo',{
          method:'POST',token,body:{plataforma:'android',token:fcm},
        });
        if(mounted)lastToken.current=id;
      }catch{
        // Sem loop de tentativas; o app continua mesmo sem Firebase.
      }finally{pushBusy.current=false;}
    };
    const register=async()=>{
      if(pushBusy.current||tokenLookupBusy.current)return;
      tokenLookupBusy.current=true;
      try{
        const value=await getNativePushToken();
        if(mounted&&value)await registerValue(value);
      }finally{tokenLookupBusy.current=false;}
    };
    void register();
    const foreground=AppState.addEventListener('change',state=>{
      if(state==='active')void register();
    });
    const changed=Notifications.addPushTokenListener(event=>{
      // O token ja vem no evento: NAO chamar getDevicePushTokenAsync de novo
      // no listener (isso pode gerar nova notificacao e ciclos de registro).
      if(event.type==='android'&&typeof event.data==='string'){
        void registerValue(event.data,true);
      }
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

