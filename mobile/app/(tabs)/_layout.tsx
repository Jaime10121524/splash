import {Tabs, Redirect} from 'expo-router';
import {useAuth} from '../../src/AuthContext';

/** Os botões do menu ficam no layout raiz e permanecem visíveis nas subpáginas. */
export default function TabsLayout(){
  const {user,ready}=useAuth();
  if(ready&&!user)return <Redirect href="/login"/>;
  return <Tabs tabBar={()=>null} screenOptions={{headerShown:false}}>
    <Tabs.Screen name="index"/>
    <Tabs.Screen name="agendamentos"/>
    <Tabs.Screen name="escanear"/>
    <Tabs.Screen name="atendimentos"/>
    <Tabs.Screen name="mais"/>
  </Tabs>;
}
