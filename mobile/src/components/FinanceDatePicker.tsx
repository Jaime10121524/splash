import {useEffect,useMemo,useState} from 'react';
import {Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../ThemeContext';

const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
const pad=(n:number)=>String(n).padStart(2,'0');
const iso=(y:number,m:number,d:number)=>y+'-'+pad(m+1)+'-'+pad(d);
const today=()=>{const d=new Date();return iso(d.getFullYear(),d.getMonth(),d.getDate());};
const monthFrom=(v:string)=>/^\d{4}-\d{2}/.test(v)?v.slice(0,7):today().slice(0,7);

export default function FinanceDatePicker({open,value,onClose,onChange}:{
  open:boolean;value:string;onClose:()=>void;onChange:(isoDate:string)=>void;
}){
  const {palette}=useTheme();
  const [shown,setShown]=useState(monthFrom(value));
  useEffect(()=>{if(open)setShown(monthFrom(value));},[open,value]);
  const year=Number(shown.slice(0,4)),month=Number(shown.slice(5,7))-1;
  const days=useMemo(()=>{
    const start=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;
    const count=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    return [...Array<null>(start).fill(null),...Array.from({length:count},(_,i)=>i+1)];
  },[year,month]);
  const changeMonth=(delta:number)=>{
    const next=new Date(Date.UTC(year,month+delta,1));
    if(next.getUTCFullYear()<1900||next.getUTCFullYear()>2100)return;
    setShown(iso(next.getUTCFullYear(),next.getUTCMonth(),1).slice(0,7));
  };
  const choose=(day:string)=>{onChange(day);onClose();};
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={s.overlay} edges={['top','bottom']}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Fechar calendário"/>
      <View style={[s.panel,{backgroundColor:palette.surface,borderColor:palette.line}]}>
        <View style={s.heading}>
          <View style={{flex:1}}>
            <Text style={[s.eyebrow,{color:palette.brandDark}]}>DATA DO LANÇAMENTO</Text>
            <Text style={[s.title,{color:palette.ink}]}>Escolha o dia</Text>
          </View>
          <Pressable onPress={onClose} style={[s.close,{backgroundColor:palette.pale}]}>
            <Text style={{color:palette.ink,fontSize:19}}>✕</Text>
          </Pressable>
        </View>
        <View style={[s.month,{backgroundColor:palette.pale}]}>
          <Pressable onPress={()=>changeMonth(-1)} style={s.arrow} accessibilityLabel="Mês anterior">
            <Text style={[s.arrowText,{color:palette.brandDark}]}>‹</Text>
          </Pressable>
          <Text style={[s.monthName,{color:palette.ink}]}>{MONTHS[month]} de {year}</Text>
          <Pressable onPress={()=>changeMonth(1)} style={s.arrow} accessibilityLabel="Próximo mês">
            <Text style={[s.arrowText,{color:palette.brandDark}]}>›</Text>
          </Pressable>
        </View>
        <View style={s.days}>
          {WEEK.map(d=><Text key={d} style={[s.weekday,{color:palette.muted}]}>{d}</Text>)}
          {days.map((day,i)=>{
            if(day===null)return <View key={'b'+i} style={s.cell}/>;
            const date=iso(year,month,day),chosen=date===value;
            return <View key={date} style={s.cell}><Pressable onPress={()=>choose(date)}
              accessibilityRole="button" accessibilityLabel={day+' de '+MONTHS[month]}
              style={[s.day,chosen&&{backgroundColor:palette.brand}]}>
              <Text style={[s.dayText,{color:chosen?'#FFFFFF':palette.ink}]}>{day}</Text>
            </Pressable></View>;
          })}
        </View>
        <Pressable onPress={()=>choose(today())} style={[s.today,{backgroundColor:palette.pale}]}>
          <Text style={[s.todayText,{color:palette.brandDark}]}>Hoje</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s=StyleSheet.create({
  overlay:{flex:1,justifyContent:'center',paddingHorizontal:16},
  scrim:{position:'absolute',top:0,left:0,bottom:0,right:0,backgroundColor:'rgba(17,13,37,.65)'},
  panel:{alignSelf:'center',width:'100%',maxWidth:430,padding:18,borderRadius:24,
    borderWidth:1,gap:15},
  heading:{flexDirection:'row',alignItems:'center'},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1},
  title:{fontSize:22,fontWeight:'900',marginTop:4},
  close:{width:39,height:39,borderRadius:12,alignItems:'center',justifyContent:'center'},
  month:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:14},
  arrow:{width:47,height:44,alignItems:'center',justifyContent:'center'},
  arrowText:{fontSize:30,fontWeight:'600'},
  monthName:{fontWeight:'900',fontSize:15},
  days:{flexDirection:'row',flexWrap:'wrap',rowGap:5},
  weekday:{width:'14.2857%',textAlign:'center',fontSize:10,fontWeight:'900',paddingVertical:5},
  cell:{width:'14.2857%',aspectRatio:1,alignItems:'center',justifyContent:'center'},
  day:{height:'90%',width:'90%',borderRadius:10,alignItems:'center',justifyContent:'center'},
  dayText:{fontSize:14,fontWeight:'800'},
  today:{borderRadius:14,minHeight:47,alignItems:'center',justifyContent:'center'},
  todayText:{fontSize:13,fontWeight:'900'},
});
