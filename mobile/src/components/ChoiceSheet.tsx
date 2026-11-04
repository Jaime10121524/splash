import {useThemedStyles} from '../ThemeContext';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export type Choice = { id: number; label: string };
export default function ChoiceSheet({
  open, title, choices, selected, onChoose, onClose, allowEmpty = false,
}: {
  open: boolean;
  title: string;
  choices: Choice[];
  selected: number | null;
  onChoose: (id: number | null) => void;
  onClose: () => void;
  allowEmpty?: boolean;
}) {
  const styles=useThemedStyles(lightStyles);
  const all = allowEmpty ? [{ id: 0, label: 'Nenhum' }, ...choices] : choices;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar seleção" />
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.close}>
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {all.map(item => {
              const isSelected = (item.id === 0 ? null : item.id) === selected;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => { onChoose(item.id === 0 ? null : item.id); onClose(); }}
                  style={[styles.choice, isSelected && styles.selected]}
                >
                  <Text style={[styles.choiceName, isSelected && styles.choiceSelected]}>{item.label}</Text>
                  {isSelected ? (
                    <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={21} tintColor={colors.brand} />
                  ) : <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={17} tintColor="#B9B2CD" />}
                </Pressable>
              );
            })}
            {!all.length && <Text style={styles.empty}>Nenhuma opção disponível.</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const lightStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(20,14,48,.50)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, maxHeight: '75%', minHeight: 190 },
  handle: { width: 46, height: 5, borderRadius: 9, backgroundColor: '#D6D1E4', alignSelf: 'center', marginTop: 12 },
  head: { paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 19, fontWeight: '800', flex: 1 },
  close: { height: 35, width: 35, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 23 },
  choice: { minHeight: 56, borderRadius: 15, borderWidth: 1, borderColor: colors.line, marginBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selected: { backgroundColor: colors.pale, borderColor: '#D1C5FF' },
  choiceName: { color: colors.ink, fontSize: 14, fontWeight: '700', flex: 1, marginRight: 10 },
  choiceSelected: { color: colors.brandDark },
  empty: { paddingVertical: 25, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
