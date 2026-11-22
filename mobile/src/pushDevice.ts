import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {apiRequest} from './api';
import {isExpoGo} from './runtime';

/** Token FCM direto (nao Expo Push), vinculado ao Firebase do APK. */
export async function getNativePushToken():Promise<string|null>{
  if(Platform.OS!=='android'||isExpoGo)return null;
  try{
    const granted=await Notifications.getPermissionsAsync();
    if(!granted.granted)return null;
    const result=await Notifications.getDevicePushTokenAsync();
    const value=result.data;
    return typeof value==='string'&&value.length>60?value:null;
  }catch{
    // Google Play Services e Firebase devem estar configurados no build.
    return null;
  }
}

export async function unregisterAndroidPush(token:string){
  const value=await getNativePushToken();
  if(!value)return;
  await apiRequest('mobile/notificacoes/dispositivo/remover',{
    method:'POST',token,body:{token:value},
  });
}
