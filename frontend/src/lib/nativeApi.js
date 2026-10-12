import { Capacitor } from '@capacitor/core'

const native=Capacitor.isNativePlatform()
const configured=(import.meta.env.VITE_SPLASH_API_ORIGIN||'').replace(/\/$/,'')
if(native && !/^https:\/\/[^/]+$/i.test(configured)){
 console.error('SPLASH: falta VITE_SPLASH_API_ORIGIN=https://DOMINIO-REAL no build nativo.')
}
export const apiCredentials=native?'include':'same-origin'
export function apiUrl(path){
 if(!native)return path
 if(!/^https:\/\/[^/]+$/i.test(configured)){
  throw new Error('Aplicativo ainda não foi configurado com a API HTTPS de produção.')
 }
 if(!path.startsWith('/api/'))throw new Error('Rota da API inválida.')
 return configured+path
}
export const isNative=()=>native
