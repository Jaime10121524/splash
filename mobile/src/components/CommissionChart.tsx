import {useEffect,useRef} from 'react';
import {Animated,StyleSheet,Text,View} from 'react-native';
import {useTheme} from '../ThemeContext';

type Props={total:string;received:string;pending:string};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);

export default function CommissionChart({total,received,pending}:Props){
  const {palette}=useTheme();
  const animation=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    animation.stopAnimation();animation.setValue(0);
    Animated.timing(animation,{toValue:1,duration:750,useNativeDriver:false}).start();
    return ()=>animation.stopAnimation();
  },[animation,total,received,pending]);
  const sum=Math.max(Number(total)||0,Number(received)||0,Number(pending)||0,0.01);
  const rows=[
    {name:'Comissão apurada',value:Math.max(0,Number(total)||0),tone:'#8D75FF'},
    {name:'Recebida',value:Math.max(0,Number(received)||0),tone:'#42BB92'},
    {name:'A receber',value:Math.max(0,Number(pending)||0),tone:'#F4AB63'},
  ];
  return <View style={[s.card,{backgroundColor:palette.surface,borderColor:palette.line}]}>
    <Text style={[s.heading,{color:palette.ink}]}>Suas comissões no período</Text>
    <Text style={[s.sub,{color:palette.muted}]}>Comparativo animado de direitos, recebidos e valores pendentes</Text>
    {rows.map((r,i)=>{
      const p=Math.max(0,Math.min(100,r.value/sum*100));
      return <View key={r.name} style={s.line}>
        <View style={s.row}>
          <Text style={[s.name,{color:palette.muted}]}>{r.name}</Text>
          <Text style={[s.number,{color:palette.ink}]}>{money(r.value)}</Text>
        </View>
        <View style={[s.track,{backgroundColor:palette.pale}]}>
          <Animated.View style={[s.bar,{backgroundColor:r.tone,
            width:animation.interpolate({inputRange:[0,1],outputRange:['0%',p+'%']})}]}/>
        </View>
      </View>;
    })}
  </View>;
}
const s=StyleSheet.create({
  card:{borderWidth:1,borderRadius:20,padding:18,gap:8},
  heading:{fontWeight:'900',fontSize:16},
  sub:{fontSize:11,lineHeight:16,marginBottom:7},
  line:{marginBottom:8,gap:8},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  name:{fontSize:12,fontWeight:'800'},
  number:{fontSize:13,fontWeight:'900'},
  track:{width:'100%',height:11,borderRadius:20,overflow:'hidden'},
  bar:{height:'100%',borderRadius:20},
});
