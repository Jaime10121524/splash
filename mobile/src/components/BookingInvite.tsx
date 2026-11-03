import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme';

export type Booking = {
  id: number;
  nome_completo: string;
  telefone: string;
  data_visita: string;
  quantidade_pessoas: number;
  captador_pessoa_id: number;
  captador_nome?: string | null;
  corretor_confirmado_pessoa_id?: number | null;
  segundo_corretor_pessoa_id?: number | null;
  atendente_pessoa_id?: number | null;
  cliente_id?: number | null;
  visita_id?: number | null;
  situacao: string;
  qr_token: string;
  visita_status?: string | null;
};

export default function BookingInvite({ booking, onClose }: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const date = booking?.data_visita?.split('-') ?? [];
  const prettyDate = date.length === 3 ? date[2] + '/' + date[1] + '/' + date[0] : booking?.data_visita;
  const code = booking?.qr_token ? 'SPLASH:AG:1:' + booking.qr_token : '';

  async function share() {
    if (!card.current || !booking || sharing || !code) return;
    setSharing(true);
    try {
      const uri = await captureRef(card.current, {
        format: 'png', quality: 1, result: 'tmpfile',
        width: 1080, height: 1350,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png', dialogTitle: 'Compartilhar convite Splash',
          UTI: 'public.png',
        });
      }
    } finally { setSharing(false); }
  }

  return <Modal visible={booking !== null} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Fechar convite">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={21} tintColor={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Convite de visita</Text>
        <View style={styles.close} />
      </View>
      <View style={styles.center}>
        {booking && <View ref={card} collapsable={false} style={styles.card}>
          <View style={styles.top}>
            <View style={styles.orbit} />
            <Text style={styles.brand}>SPLASH NEXT</Text>
            <Text style={styles.tagline}>Sua visita começa aqui.</Text>
          </View>
          <View style={styles.main}>
            <Text style={styles.eyebrow}>AGENDAMENTO CONFIRMADO</Text>
            <Text style={styles.name} numberOfLines={2}>{booking.nome_completo}</Text>
            <Text style={styles.date}>{prettyDate} · {booking.quantidade_pessoas} pessoa(s)</Text>
            <View style={styles.qrContainer}>
              <QRCode size={206} value={code || 'SPLASH:INVÁLIDO'}
                backgroundColor="#FFFFFF" color={colors.navy}
                ecl="M" quietZone={4} />
            </View>
            <Text style={styles.instruction}>Apresente o QR na chegada</Text>
            <Text style={styles.note}>Conferência pela equipe do clube</Text>
            <Text style={styles.number}>AGENDAMENTO Nº {booking.id}</Text>
          </View>
        </View>}
      </View>
      <Pressable onPress={() => { void share(); }} disabled={!booking || sharing}
        style={[styles.share, sharing && styles.disabled]} accessibilityRole="button">
        {sharing ? <ActivityIndicator color="#FFFFFF" /> : <>
          <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} tintColor="#FFFFFF" />
          <Text style={styles.shareText}>Compartilhar imagem do convite</Text>
        </>}
      </Pressable>
      <Text style={styles.footer}>O QR Code só pode ser utilizado na recepção por um usuário autorizado.</Text>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 17 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  close: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { width: 328, height: 410, borderRadius: 21, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center' },
  top: { backgroundColor: colors.navy, width: '100%', height: 93, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orbit: { position: 'absolute', width: 160, height: 160, borderRadius: 90, backgroundColor: '#6B52BF', right: -75, top: -80, opacity: .5 },
  brand: { color: '#C9BBFF', fontWeight: '900', fontSize: 11, letterSpacing: 2.5 },
  tagline: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', marginTop: 7 },
  main: { flex: 1, alignItems: 'center', width: '100%', padding: 13 },
  eyebrow: { color: colors.brandDark, fontWeight: '900', fontSize: 9, letterSpacing: 1.1 },
  name: { fontSize: 17, fontWeight: '900', color: colors.navy, marginTop: 7, textAlign: 'center' },
  date: { fontSize: 11, color: colors.muted, marginTop: 4 },
  qrContainer: { marginTop: 8, backgroundColor: '#FFFFFF', padding: 2, alignItems: 'center', justifyContent: 'center' },
  instruction: { color: colors.navy, fontWeight: '900', fontSize: 12, marginTop: 6 },
  note: { color: colors.muted, fontSize: 10, marginTop: 4 },
  number: { color: colors.brandDark, fontSize: 10, fontWeight: '900', marginTop: 8 },
  share: { backgroundColor: colors.brand, height: 55, borderRadius: 17,
    flexDirection: 'row', gap: 11, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  disabled: { opacity: .6 },
  footer: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 11, marginBottom: 9 },
});
