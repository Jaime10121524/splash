import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { colors } from '../theme';

const weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const pad = (v: number) => String(v).padStart(2, '0');
const isoLocal = (d: Date) => [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
const plusDays = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return isoLocal(d);
};
const isoDay = (y: number, m: number, d: number) => [y, pad(m + 1), pad(d)].join('-');

export default function VisitDateCalendar({
  open, value, onChange, onClose,
}: {
  open: boolean;
  value: string;
  onChange: (nextISO: string) => void;
  onClose: () => void;
}) {
  const today = plusDays(0);
  const [visibleMonth, setVisibleMonth] = useState(() => value.slice(0, 7) || today.slice(0, 7));

  useEffect(() => {
    if (open) setVisibleMonth((value || today).slice(0, 7));
  }, [open, value]);

  const year = Number(visibleMonth.slice(0, 4));
  const month = Number(visibleMonth.slice(5, 7)) - 1;
  const cells = useMemo(() => {
    const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return [...Array<null>(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month, year]);

  function moveMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setVisibleMonth(d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1));
  }

  function pick(day: string) {
    onChange(day); onClose();
  }

  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fechar calendário" />
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>AGENDAR VISITA</Text>
            <Text style={styles.heading}>Escolha a data</Text>
          </View>
          <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Fechar">
            <SymbolView name={{ios:'xmark',android:'close'}} size={19} tintColor={colors.ink}/>
          </Pressable>
        </View>
        <View style={styles.month}>
          <Pressable style={styles.arrow} onPress={() => moveMonth(-1)}
            disabled={visibleMonth <= today.slice(0, 7)}
            accessibilityLabel="Mês anterior">
            <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} size={21}
              tintColor={visibleMonth <= today.slice(0, 7) ? '#C9C4DA' : colors.brandDark}/>
          </Pressable>
          <Text style={styles.monthName}>{months[month]} de {year}</Text>
          <Pressable style={styles.arrow} onPress={() => moveMonth(1)}
            accessibilityLabel="Próximo mês">
            <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={21}
              tintColor={colors.brandDark}/>
          </Pressable>
        </View>
        <View style={styles.days}>
          {weekdays.map(v => <Text style={styles.weekday} key={v}>{v}</Text>)}
          {cells.map((day, index) => {
            const iso = day === null ? '' : isoDay(year, month, day);
            const disabled = iso !== '' && iso < today;
            const selected = iso === value;
            return <View key={index} style={styles.cell}>
              {day !== null && <Pressable style={[styles.day, selected && styles.selected]}
                accessibilityRole="button"
                accessibilityLabel={day + ' de ' + months[month]}
                disabled={disabled}
                onPress={() => pick(iso)}>
                <Text style={[styles.dayText, disabled && styles.dim, selected && styles.selectedText]}>
                  {day}
                </Text>
              </Pressable>}
            </View>;
          })}
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.shortcut} onPress={() => pick(today)}>
            <Text style={styles.shortcutText}>Hoje</Text>
          </Pressable>
          <Pressable style={styles.shortcut} onPress={() => pick(plusDays(1))}>
            <Text style={styles.shortcutText}>Amanhã</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex:1, justifyContent:'center', paddingHorizontal:17 },
  scrim: { position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'rgba(20,14,48,.62)' },
  panel: { backgroundColor:'#FFFFFF', borderRadius:26, padding:19, maxWidth:440, width:'100%', alignSelf:'center' },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:17 },
  eyebrow: { fontSize:10, fontWeight:'900', letterSpacing:1.3, color:colors.brandDark },
  heading: { color:colors.ink, fontSize:22, fontWeight:'900', marginTop:5 },
  close: { width:36,height:36,borderRadius:12,backgroundColor:colors.background,justifyContent:'center',alignItems:'center' },
  month: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:colors.pale,borderRadius:16,padding:5 },
  monthName: { fontWeight:'900', fontSize:15, color:colors.navy },
  arrow: { width:43,height:43,alignItems:'center',justifyContent:'center' },
  days: { flexDirection:'row', flexWrap:'wrap', marginTop:14, rowGap:4 },
  weekday: { width:'14.2857%',textAlign:'center',color:colors.muted,fontSize:10,fontWeight:'900',paddingVertical:8 },
  cell: { width:'14.2857%',aspectRatio:1,alignItems:'center',justifyContent:'center' },
  day: { width:'88%',aspectRatio:1,alignItems:'center',justifyContent:'center',borderRadius:13 },
  dayText: { fontSize:14,fontWeight:'800',color:colors.ink },
  dim: { color:'#C9C4DA' },
  selected: { backgroundColor:colors.brandDark },
  selectedText: { color:'#FFFFFF' },
  actions: { flexDirection:'row',gap:10,marginTop:20 },
  shortcut: { flex:1,backgroundColor:colors.pale,borderRadius:13,paddingVertical:14,alignItems:'center' },
  shortcutText: { color:colors.brandDark,fontWeight:'900',fontSize:13 },
});
