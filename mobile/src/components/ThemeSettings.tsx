import {useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {ThemeMode,useTheme} from '../ThemeContext';

const options:{mode:ThemeMode;label:string;symbol:string}[]=[
  {mode:'light',label:'Claro',symbol:'☀️'},
  {mode:'dark',label:'Escuro',symbol:'🌙'},
  {mode:'system',label:'Automático',symbol:'📱'},
];

export default function ThemeSettings(){
  const {mode,resolved,palette,setMode}=useTheme();
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function choose(next:ThemeMode){
    if(saving||mode===next)return;
    setSaving(true);setError('');
    try{await setMode(next);}
    catch{setError('Não foi possível salvar sua preferência de aparência.');}
    finally{setSaving(false);}
  }
  return <View style={[s.card,{backgroundColor:palette.surface,borderColor:palette.line}]}>
    <Text style={[s.title,{color:palette.ink}]}>Aparência</Text>
    <Text style={[s.subtitle,{color:palette.muted}]}>
      Escolha um tema ou acompanhe automaticamente o tema do seu celular.
    </Text>
    <View style={s.options}>
      {options.map(item=><Pressable key={item.mode}
        accessibilityRole="radio" accessibilityState={{selected:mode===item.mode,disabled:saving}}
        onPress={()=>{void choose(item.mode);}} disabled={saving}
        style={[s.option,{backgroundColor:mode===item.mode?palette.pale:palette.background,
          borderColor:mode===item.mode?palette.brand:palette.line}]}>
        <Text style={s.symbol}>{item.symbol}</Text>
        <Text style={[s.label,{color:mode===item.mode?palette.brandDark:palette.ink}]}>
          {item.label}
        </Text>
        {mode===item.mode?<Text style={[s.mark,{color:palette.brandDark}]}>✓</Text>:null}
      </Pressable>)}
    </View>
    <Text style={[s.note,{color:palette.muted}]}>
      {mode==='system'
        ?'Automático ativado: acompanhando o celular ('+(resolved==='dark'?'escuro':'claro')+').'
        :'Sua escolha fica salva mesmo depois de fechar o aplicativo.'}
    </Text>
    {!!error&&<Text style={[s.error,{color:palette.danger}]}>{error}</Text>}
  </View>;
}
const s=StyleSheet.create({
  card:{padding:19,borderRadius:22,borderWidth:1,gap:11},
  title:{fontSize:16,fontWeight:'900'},
  subtitle:{fontSize:12,lineHeight:19},
  options:{flexDirection:'row',gap:7},
  option:{flex:1,minHeight:74,borderRadius:15,paddingHorizontal:4,borderWidth:1.5,
    alignItems:'center',justifyContent:'center',gap:3},
  symbol:{fontSize:21},
  label:{fontSize:11,fontWeight:'900'},
  mark:{fontSize:11,fontWeight:'900',position:'absolute',top:4,right:6},
  note:{fontSize:11,lineHeight:17},
  error:{fontSize:11,fontWeight:'700'},
});
