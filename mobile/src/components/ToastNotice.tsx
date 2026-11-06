import {useThemedStyles} from '../ThemeContext';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { colors } from '../theme';

/** Aviso sem decisão: fecha automaticamente e mostra tempo restante no degradê. */
export default function ToastNotice({
  message, onDismiss, duration = 4800, kind = 'info',
}: {
  message: string;
  onDismiss: () => void;
  duration?: number;
  kind?: 'info' | 'success' | 'error';
}) {
  const styles=useThemedStyles(lightStyles);
  const progress=useRef(new Animated.Value(1)).current;
  const dismiss=useRef(onDismiss);
  dismiss.current=onDismiss;
  useEffect(()=>{
    if (!message) return;
    progress.stopAnimation();
    progress.setValue(1);
    const anim=Animated.timing(progress,{
      toValue:0,duration,useNativeDriver:false,
    });
    anim.start(({finished})=>{if(finished)dismiss.current();});
    return ()=>anim.stop();
  },[message,duration,progress]);
  if (!message) return null;
  return <View style={styles.position} pointerEvents="box-none">
    <View style={styles.toast} accessibilityRole="alert">
      <View style={styles.content}>
        <View style={[styles.icon,kind==='error'&&styles.iconError,kind==='success'&&styles.iconSuccess]}>
          <SymbolView name={kind==='error'
            ?{ios:'exclamationmark.circle.fill',android:'error'}
            :{ios:'checkmark.circle.fill',android:'check_circle'}}
            size={20} tintColor={kind==='error'?'#A7523B':colors.brand}/>
        </View>
        <Text style={styles.message}>{message}</Text>
        <Pressable onPress={onDismiss} style={styles.close} accessibilityLabel="Fechar aviso">
          <SymbolView name={{ios:'xmark',android:'close'}} size={16} tintColor="#938BA5"/>
        </Pressable>
      </View>
      <View style={styles.track}>
        <Animated.View style={{height:'100%',width:progress.interpolate({
          inputRange:[0,1],outputRange:['0%','100%'],
        })}}>
          <LinearGradient colors={['#C8B9FF','#917CFB','#624CDE']}
            start={{x:0,y:0}} end={{x:1,y:0}} style={styles.gradient}/>
        </Animated.View>
      </View>
    </View>
  </View>;
}
const lightStyles = StyleSheet.create({
  position:{position:'absolute',top:11,left:15,right:15,zIndex:200},
  toast:{backgroundColor:'#FFFFFF',borderRadius:17,overflow:'hidden',borderWidth:1,borderColor:'#E7E2F5',
    elevation:15,shadowColor:'#251B49',shadowOpacity:.15,shadowOffset:{width:0,height:8},shadowRadius:18},
  content:{padding:13,minHeight:63,flexDirection:'row',alignItems:'center',gap:10},
  icon:{width:32,height:32,borderRadius:11,backgroundColor:colors.pale,alignItems:'center',justifyContent:'center'},
  iconError:{backgroundColor:'#FFF1E8'},
  iconSuccess:{backgroundColor:'#EBF7F1'},
  message:{color:colors.ink,fontWeight:'700',fontSize:12,lineHeight:18,flex:1},
  close:{width:24,height:30,alignItems:'center',justifyContent:'center'},
  track:{height:4,width:'100%',backgroundColor:'#F1EDFB'},
  gradient:{width:'100%',height:'100%'},
});
