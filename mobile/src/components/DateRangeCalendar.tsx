import {useEffect,useMemo,useState} from 'react';
import {Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../ThemeContext';

const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
const pad=(n:number)=>String(n).padStart(2,'0');
const isoFrom=(y:number,m:number,d:number)=>y+'-'+pad(m+1)+'-'+pad(d);
const today=()=>{const d=new Date();return isoFrom(d.getFullYear(),d.getMonth(),d.getDate());};
const monthOf=(v:string)=>(v||today()).slice(0,7);
const br=(v:string)=>v?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'Escolher';
function daysAgo(n:number){const d=new Date();d.setDate(d.getDate()-n);return isoFrom(d.getFullYear(),d.getMonth(),d.getDate());}

/** Seleção de duas datas numa única janela, incluindo meses e anos anteriores. */
export default function DateRangeCalendar({open,start,end,onClose,onConfirm}:{
  open:boolean;start:string;end:string;onClose:()=>void;
  onConfirm:(startISO:string,endISO:string)=>void;
}){
  const {palette}=useTheme();
  const [visibleMonth,setVisibleMonth]=useState(monthOf(start));
  const [first,setFirst]=useState(start),[last,setLast]=useState(end);
  const [phase,setPhase]=useState<'start'|'end'>('start');
  useEffect(()=>{
    if(open){setFirst(start);setLast(end);setPhase(start&&!end?'end':'start');setVisibleMonth(monthOf(start||end));}
  },[open,start,end]);
  const year=Number(visibleMonth.slice(0,4)),month=Number(visibleMonth.slice(5,7))-1;
  const cells=useMemo(()=>{
    const offset=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;
    const size=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    return [...Array<null>(offset).fill(null),...Array.from({length:size},(_,i)=>i+1)];
  },[year,month]);
  function move(n:number){
    const d=new Date(Date.UTC(year,month+n,1));
    setVisibleMonth(d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1));
  }
  function choose(value:string){
    if(phase==='start'||!first||last){setFirst(value);setLast('');setPhase('end');return;}
    if(value<first){setLast(first);setFirst(value);}else setLast(value);
    setPhase('start');
  }
  function preset(n:number){setFirst(daysAgo(n-1));setLast(today());setPhase('start');setVisibleMonth(monthOf(today()));}
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={s.overlay}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Fechar calendário"/>
      <View style={[s.panel,{backgroundColor:palette.surface,borderColor:palette.line}]}>
        <View style={s.heading}><View style={{flex:1}}>
          <Text style={[s.kicker,{color:palette.brandDark}]}>FILTRO POR PERÍODO</Text>
          <Text style={[s.title,{color:palette.ink}]}>Escolha as datas</Text></View>
          <Pressable onPress={onClose} style={[s.close,{backgroundColor:palette.pale}]}>
            <Text style={{color:palette.ink,fontSize:18}}>✕</Text></Pressable></View>
        <View style={s.range}>
          <View style={[s.rangeChip,{backgroundColor:palette.pale,borderColor:phase==='start'?palette.brand:palette.line}]}>
            <Text style={[s.rangeLabel,{color:palette.muted}]}>INÍCIO</Text>
            <Text style={[s.rangeValue,{color:palette.ink}]}>{br(first)}</Text></View>
          <Text style={{color:palette.muted}}>→</Text>
          <View style={[s.rangeChip,{backgroundColor:palette.pale,borderColor:phase==='end'?palette.brand:palette.line}]}>
            <Text style={[s.rangeLabel,{color:palette.muted}]}>FIM</Text>
            <Text style={[s.rangeValue,{color:palette.ink}]}>{br(last)}</Text></View>
        </View>
        <Text style={[s.hint,{color:palette.muted}]}>{phase==='start'?'Toque na data inicial.':'Agora escolha a data final.'}</Text>
        <View style={[s.monthBar,{backgroundColor:palette.pale}]}>
          <Pressable onPress={()=>move(-1)} style={s.arrow} accessibilityLabel="Mês anterior">
            <Text style={[s.arrowText,{color:palette.brandDark}]}>‹</Text></Pressable>
          <Text style={[s.monthLabel,{color:palette.ink}]}>{MONTHS[month]} de {year}</Text>
          <Pressable onPress={()=>move(1)} style={s.arrow} accessibilityLabel="Próximo mês">
            <Text style={[s.arrowText,{color:palette.brandDark}]}>›</Text></Pressable>
        </View>
        <View style={s.calendar}>
          {WEEK.map((w,i)=><Text key={i} style={[s.weekday,{color:palette.muted}]}>{w}</Text>)}
          {cells.map((day,i)=>{
            if(day===null)return <View key={'blank'+i} style={s.cell}/>;
            const value=isoFrom(year,month,day);
            const edge=value===first||value===last;
            const between=!!first&&!!last&&value>first&&value<last;
            return <View key={value} style={s.cell}><Pressable onPress={()=>choose(value)}
              accessibilityRole="button" accessibilityLabel={day+' de '+MONTHS[month]}
              style={[s.day,between&&{backgroundColor:palette.pale},edge&&{backgroundColor:palette.brand}]}>
              <Text style={[s.dayText,{color:edge?'#FFFFFF':palette.ink}]}>{day}</Text>
            </Pressable></View>;
          })}
        </View>
        <View style={s.shortcuts}>
          {([7,30] as const).map(n=><Pressable key={n} onPress={()=>preset(n)}
            style={[s.shortcut,{backgroundColor:palette.pale}]}>
            <Text style={[s.shortText,{color:palette.brandDark}]}>{n} dias</Text></Pressable>)}
          <Pressable onPress={()=>{setFirst(today());setLast(today());setPhase('start');setVisibleMonth(monthOf(today()));}}
            style={[s.shortcut,{backgroundColor:palette.pale}]}>
            <Text style={[s.shortText,{color:palette.brandDark}]}>Hoje</Text></Pressable>
        </View>
        <Pressable disabled={!first||!last} onPress={()=>onConfirm(first,last)}
          style={[s.confirm,{backgroundColor:palette.brand,opacity:first&&last?1:.45}]}>
          <Text style={s.confirmText}>{first&&last?'Aplicar período':'Escolha início e fim'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}
const s=StyleSheet.create({
  overlay:{flex:1,justifyContent:'center',padding:17},
  scrim:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(9,11,27,.70)'},
  panel:{borderRadius:24,padding:18,borderWidth:1,gap:12,maxWidth:450,width:'100%',alignSelf:'center'},
  heading:{flexDirection:'row',alignItems:'center',gap:10},
  kicker:{fontWeight:'900',fontSize:10,letterSpacing:1},
  title:{fontSize:22,fontWeight:'900',marginTop:4},
  close:{width:39,height:39,borderRadius:12,justifyContent:'center',alignItems:'center'},
  range:{flexDirection:'row',alignItems:'center',gap:6},
  rangeChip:{flex:1,padding:10,borderWidth:1.5,borderRadius:12,gap:5},
  rangeLabel:{fontSize:9,fontWeight:'900',letterSpacing:.7},
  rangeValue:{fontSize:13,fontWeight:'900'},
  hint:{fontSize:11,fontWeight:'700',textAlign:'center'},
  monthBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:14},
  arrow:{width:46,height:43,justifyContent:'center',alignItems:'center'},
  arrowText:{fontSize:29},
  monthLabel:{fontSize:14,fontWeight:'900'},
  calendar:{flexDirection:'row',flexWrap:'wrap',rowGap:4},
  weekday:{width:'14.2857%',textAlign:'center',fontSize:10,fontWeight:'900',paddingVertical:8},
  cell:{width:'14.2857%',aspectRatio:1,alignItems:'center',justifyContent:'center'},
  day:{height:'90%',width:'90%',borderRadius:11,justifyContent:'center',alignItems:'center'},
  dayText:{fontSize:13,fontWeight:'800'},
  shortcuts:{flexDirection:'row',gap:7},
  shortcut:{flex:1,borderRadius:11,padding:11,alignItems:'center'},
  shortText:{fontWeight:'900',fontSize:12},
  confirm:{minHeight:51,borderRadius:14,justifyContent:'center',alignItems:'center'},
  confirmText:{fontSize:14,fontWeight:'900',color:'#FFFFFF'},
});
