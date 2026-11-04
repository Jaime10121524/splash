import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {Appearance,useColorScheme} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {colors as light} from './theme';

export type ThemeMode='system'|'light'|'dark';
export type SplashPalette={ [K in keyof typeof light]:string };
const KEY='splash.mobile.theme.preference.v1';

const dark:SplashPalette={
  brand:'#9E8BFF',
  brandDark:'#B9AAFF',
  ink:'#F5F5FF',
  muted:'#B2BED5',
  background:'#111525',
  surface:'#1D2336',
  line:'#373D55',
  pale:'#302B4B',
  danger:'#FF8194',
  warning:'#FFC47C',
  navy:'#2A2251',
  white:'#FFFFFF',
};

type ThemeState={mode:ThemeMode;resolved:'light'|'dark';isDark:boolean;
  palette:SplashPalette;setMode:(mode:ThemeMode)=>Promise<void>};
const Context=createContext<ThemeState|null>(null);

export function ThemeProvider({children}:{children:React.ReactNode}){
  const system=useColorScheme();
  const [mode,setSelected]=useState<ThemeMode>('system');
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    let active=true;
    SecureStore.getItemAsync(KEY).then(value=>{
      if(active && (value==='system'||value==='light'||value==='dark'))setSelected(value);
    }).catch(()=>{}).finally(()=>{if(active)setLoaded(true);});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(loaded)Appearance.setColorScheme(mode==='system'?null:mode);
    return ()=>{};
  },[mode,loaded]);
  const setMode=useCallback(async(value:ThemeMode)=>{
    // Não atualizar a interface se o aparelho não conseguiu salvar a escolha.
    await SecureStore.setItemAsync(KEY,value);
    setSelected(value);
  },[]);
  const resolved=mode==='system'?(system==='dark'?'dark':'light'):mode;
  const state=useMemo<ThemeState>(()=>({mode,resolved,isDark:resolved==='dark',
    palette:resolved==='dark'?dark:light,setMode}),[mode,resolved,setMode]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useTheme():ThemeState{
  const ctx=useContext(Context);
  if(!ctx)throw new Error('useTheme precisa do ThemeProvider');
  return ctx;
}

// Conversão de estilos legados do Splash sem inverter ícones, fotos ou gráficos.
// Somente tokens de aparência de View/Text são adaptados; posições e medidas não mudam.
function transform(value:string,prop:string):string{
  const normalized=value.toUpperCase();
  if(prop==='shadowColor')return '#000000';
  if(prop==='color'){
    const textColors:Record<string,string>={
      '#1B2540':dark.ink,'#24184E':dark.ink,'#29203E':dark.ink,
      '#79829A':dark.muted,'#9AA6B5':dark.muted,'#948AAE':dark.muted,
      '#A6A0B4':dark.muted,'#A8A2B3':dark.muted,'#928DA0':dark.muted,
      '#817A92':dark.muted,'#624CDE':dark.brandDark,
      '#7861F9':dark.brand,'#C93748':dark.danger,
      '#D48B26':dark.warning,
    };
    if(textColors[normalized])return textColors[normalized];
    // Outros textos escuros do design original também recebem contraste adequado.
    if(/^#[0-9A-F]{6}$/.test(normalized)){
      const r=parseInt(normalized.slice(1,3),16),g=parseInt(normalized.slice(3,5),16),
        b=parseInt(normalized.slice(5,7),16);
      if(Math.max(r,g,b)<115 && Math.abs(r-g)<85 && Math.abs(g-b)<95)return dark.ink;
    }
    return value;
  }
  if(prop==='borderColor'||prop==='borderTopColor'||prop==='borderBottomColor'||prop==='borderLeftColor'||prop==='borderRightColor'){
    if(normalized==='#FFFFFF')return dark.line;
    if(normalized==='#F3CFD7'||normalized==='#F7D8DE'||normalized==='#F3D8DD')return '#75465A';
    return dark.line;
  }
  if(prop==='backgroundColor'){
    const backgrounds:Record<string,string>={
      '#FFFFFF':dark.surface,'#F7F8FC':dark.background,
      '#FAFAFF':'#252B40','#FAFAFE':'#252B40',
      '#EFEAFF':dark.pale,'#F2EEFF':dark.pale,
      '#F0EAFE':dark.pale,'#F1ECFF':dark.pale,
      '#F8F6FF':'#27253C','#F7F5FF':'#27253C',
      '#F2E7FF':'#302B4B','#E4D8FF':'#423764',
      '#E6DBFF':'#433765','#EDE7FF':dark.pale,
      '#F5F3FA':'#272C42','#F4F1FB':'#272C42',
      '#E9EAF2':dark.line,'#EBF7EF':'#193A30',
      '#EAF8EF':'#193A30','#E2F8EC':'#193A30',
      '#FFF0E9':'#402A2C','#FFF0EB':'#402A2C',
      '#F0EDF5':'#252B40','#F0EBFF':dark.pale,
      '#24184E':dark.navy,'#E9F0FF':'#242E46',
    };
    if(backgrounds[normalized])return backgrounds[normalized];
    return value;
  }
  return value;
}

export function useThemedStyles<T extends Record<string,any>>(styles:T):T{
  const {isDark}=useTheme();
  return useMemo(()=>{
    if(!isDark)return styles;
    const next:Record<string,unknown>={};
    for(const [key,style] of Object.entries(styles)){
      if(!style || typeof style!=='object'){next[key]=style;continue;}
      next[key]=Object.fromEntries(Object.entries(style as Record<string,unknown>).map(([prop,val])=>
        [prop,typeof val==='string'?transform(val,prop):val]));
    }
    return next as T;
  },[styles,isDark]);
}
