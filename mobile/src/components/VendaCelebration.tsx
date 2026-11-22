import {useEffect,useMemo,useRef} from 'react';
import {Animated,Dimensions,StyleSheet,Text,View} from 'react-native';
import * as Haptics from 'expo-haptics';

type Props={visible:boolean;onDone:()=>void};
const W=Dimensions.get('window').width;
const colors=['#8B70FF','#F9C846','#56D8C4','#FF83B0','#FFFFFF'];
const points=Array.from({length:34},(_,i)=>{
  const n=i%17,burst=i<17?0:1;
  const angle=(2*Math.PI*n/17)+(burst===1?.15:0);
  const distance=90+(i%5)*14;
  return {
    x:Math.cos(angle)*distance+(burst?32:-32),
    y:Math.sin(angle)*distance-(burst?55:75),
    delay:burst?160:0,
    color:colors[i%colors.length],
    symbol:i%4===0?'✦':i%4===1?'★':'●',
    size:i%4===0?23:13,
  };
});

/** Festa leve sem dependencias nativas adicionais, com dois estouros e vibracao. */
export default function VendaCelebration({visible,onDone}:Props){
  const progress=useRef(new Animated.Value(0)).current;
  const end=useRef(onDone);end.current=onDone;
  const pieces=useMemo(()=>points,[]);
  useEffect(()=>{
    if(!visible)return;
    progress.setValue(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(()=>{});
    const anim=Animated.timing(progress,{toValue:1,duration:2050,useNativeDriver:true});
    anim.start(({finished})=>{if(finished)end.current();});
    return ()=>{anim.stop();};
  },[visible,progress]);
  if(!visible)return null;
  return <View pointerEvents="none" style={styles.overlay}>
    <View style={styles.center}>
      {pieces.map((p,i)=><Animated.Text key={i} style={{
        position:'absolute',fontSize:p.size,color:p.color,fontWeight:'900',
        opacity:progress.interpolate({inputRange:[0,p.delay/2050,.22,.72,1],
          outputRange:[0,0,1,.9,0],extrapolate:'clamp'}),
        transform:[
          {translateX:progress.interpolate({inputRange:[0,1],outputRange:[0,p.x]})},
          {translateY:progress.interpolate({inputRange:[0,1],outputRange:[0,p.y]})},
          {rotate:progress.interpolate({inputRange:[0,1],outputRange:['0deg','540deg']})},
        ],
      }}>{p.symbol}</Animated.Text>)}
      <Animated.View style={[styles.centerGlow,{opacity:progress.interpolate({
        inputRange:[0,.1,.65,1],outputRange:[0,.94,.82,0]})}]}>
        <Text style={styles.firework}>🎆</Text>
        <Text style={styles.message}>VENDA FECHADA!</Text>
        <Text style={styles.sub}>Parabéns pela conquista!</Text>
      </Animated.View>
    </View>
  </View>;
}
const styles=StyleSheet.create({
  overlay:{...StyleSheet.absoluteFillObject,zIndex:999,
    justifyContent:'center',alignItems:'center'},
  center:{width:W,height:380,justifyContent:'center',alignItems:'center'},
  centerGlow:{backgroundColor:'#291D57',paddingVertical:27,paddingHorizontal:24,
    minWidth:W*.76,borderRadius:24,alignItems:'center',
    borderWidth:2,borderColor:'#CEB8FF'},
  firework:{fontSize:43,marginBottom:6},
  message:{fontSize:24,color:'#FFFFFF',fontWeight:'900',textAlign:'center'},
  sub:{fontSize:13,color:'#E5D8FF',marginTop:6,fontWeight:'700'},
});
