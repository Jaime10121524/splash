import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View,
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

const cardWidth = Math.min(Dimensions.get('window').width - 34, 360);
const benefits = [
  'Tour guiado pelo clube',
  'Café de boas-vindas chegando até as 10 horas',
  'Apresentação de condições exclusivas para associação',
  'Utilização da área rural após atendimento',
];
const rules = [
  'Somente na data agendada',
  'Recepção das 08 às 18 horas',
  'Não inclui uso do parque aquático antes da associação',
  'Toda e qualquer promoção é válida somente para o dia da visita',
  'Sujeito à programação e funcionamento do clube',
];

export default function BookingInvite({ booking, onClose }: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const date = booking?.data_visita?.split('-') ?? [];
  const prettyDate = date.length === 3 ? date[2] + '/' + date[1] + '/' + date[0] : booking?.data_visita;
  const code = booking?.qr_token ? 'SPLASH:AG:1:' + booking.qr_token : '';

  async function share() {
    if (!card.current || !booking || sharing || !code) return;
    setSharing(true);
    setError('');
    try {
      // Somente o token do agendamento vai no QR Code; sem dados pessoais.
      // Mantém proporção do voucher ao exportar em alta resolução.
      const uri = await captureRef(card.current, {
        format: 'png', quality: 1, result: 'tmpfile', width: 1080,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png', dialogTitle: 'Compartilhar voucher Splash Park Fazendinha',
          UTI: 'public.png',
        });
      } else {
        setError('Compartilhamento indisponível neste dispositivo.');
      }
    } catch {
      setError('Não foi possível gerar a imagem. Tente novamente.');
    } finally {
      setSharing(false);
    }
  }

  return <Modal visible={booking !== null} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Fechar voucher">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={21} tintColor={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Voucher de visita</Text>
        <View style={styles.close} />
      </View>
      <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
        {booking && <View ref={card} collapsable={false} style={[styles.card, { width: cardWidth }]}>
          <View style={styles.top}>
            <View style={styles.orbit} />
            <Text style={styles.brand}>SPLASH PARK</Text>
            <Text style={styles.fazendinha}>FAZENDINHA</Text>
            <Text style={styles.tagline}>VOUCHER DE VISITA AGENDADA</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.brokerCaption}>VOCÊ SERÁ ATENDIDO PELO CORRETOR:</Text>
            <Text style={styles.brokerName}>{booking.captador_nome || 'Corretor responsável'}</Text>
            <View style={styles.divider} />
            <View style={styles.dataRow}>
              <View style={styles.dateBlock}>
                <Text style={styles.fieldLabel}>DATA DA VISITA</Text>
                <Text style={styles.dateValue}>{prettyDate}</Text>
              </View>
              <View style={styles.peopleBlock}>
                <Text style={styles.fieldLabel}>PESSOAS</Text>
                <Text style={styles.dateValue}>{booking.quantidade_pessoas}</Text>
              </View>
            </View>
            <Text style={styles.fieldLabel}>NOME DO CLIENTE</Text>
            <Text style={styles.clientName}>{booking.nome_completo}</Text>
            <View style={styles.qrContainer}>
              <QRCode size={174} value={code || 'SPLASH:SEM-CODIGO'}
                backgroundColor="#FFFFFF" color="#24184E"
                ecl="M" quietZone={10} />
              <Text style={styles.qrInstruction}>APRESENTE O QR CODE NA RECEPÇÃO</Text>
              <Text style={styles.number}>AGENDAMENTO Nº {booking.id}</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>O que você vai ter nessa visita</Text>
              {benefits.map((item, index) =>
                <View style={styles.item} key={item}>
                  <Text style={styles.itemMarker}>{index + 1}.</Text>
                  <Text style={styles.itemText}>{item}</Text>
                </View>,
              )}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Regras do voucher</Text>
              {rules.map((item, index) =>
                <View style={styles.item} key={item}>
                  <Text style={styles.itemMarker}>{index + 1}.</Text>
                  <Text style={styles.itemText}>{item}</Text>
                </View>,
              )}
            </View>
            <View style={styles.address}>
              <Text style={styles.addressHeading}>ONDE FICAMOS</Text>
              <Text style={styles.addressText}>Estrada do Frutuoso, 315, Santa Cruz, Rio de Janeiro - RJ</Text>
            </View>
          </View>
        </View>}
      </ScrollView>
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <Pressable onPress={() => { void share(); }} disabled={!booking || sharing}
        style={[styles.share, sharing && styles.disabled]} accessibilityRole="button">
        {sharing ? <ActivityIndicator color="#FFFFFF" /> : <>
          <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} tintColor="#FFFFFF" />
          <Text style={styles.shareText}>Compartilhar voucher em PNG</Text>
        </>}
      </Pressable>
      <Text style={styles.footer}>Válido somente na data indicada. Entrada no parque aquático não inclusa.</Text>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  close: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  previewScroll: { flex: 1 },
  previewContent: { alignItems: 'center', paddingBottom: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' },
  top: { backgroundColor: colors.navy, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, alignItems: 'center', overflow: 'hidden' },
  orbit: { position: 'absolute', width: 220, height: 220, borderRadius: 120, backgroundColor: '#6B52BF', right: -95, top: -110, opacity: .45 },
  brand: { color: '#FFFFFF', fontWeight: '900', fontSize: 24, letterSpacing: 1.1 },
  fazendinha: { color: '#DACFFF', fontWeight: '900', fontSize: 19, letterSpacing: 2.6 },
  tagline: { marginTop: 8, color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  body: { paddingHorizontal: 19, paddingTop: 17, paddingBottom: 19 },
  brokerCaption: { color: colors.brandDark, fontSize: 10, fontWeight: '900', letterSpacing: .55, textAlign: 'center' },
  brokerName: { color: colors.navy, fontSize: 22, fontWeight: '900', lineHeight: 26, textAlign: 'center', marginTop: 7 },
  divider: { height: 1, backgroundColor: '#E5DFFF', marginVertical: 15 },
  dataRow: { flexDirection: 'row', gap: 10, marginBottom: 11 },
  dateBlock: { flex: 1, backgroundColor: '#F4F0FF', padding: 12, borderRadius: 12 },
  peopleBlock: { width: 86, backgroundColor: '#F4F0FF', padding: 12, borderRadius: 12 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  dateValue: { color: colors.navy, fontSize: 16, fontWeight: '900', marginTop: 5 },
  clientName: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 5, lineHeight: 20 },
  qrContainer: { alignItems: 'center', paddingVertical: 7, marginTop: 8, backgroundColor: '#FFFFFF' },
  qrInstruction: { color: colors.navy, fontWeight: '900', fontSize: 10, marginTop: 5, textAlign: 'center' },
  number: { color: colors.brandDark, fontWeight: '900', fontSize: 10, marginTop: 4 },
  section: { borderRadius: 12, backgroundColor: '#F7F5FF', padding: 12, marginTop: 11 },
  sectionTitle: { color: colors.navy, fontSize: 14, fontWeight: '900', marginBottom: 7 },
  item: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, gap: 6 },
  itemMarker: { color: colors.brandDark, fontSize: 11, fontWeight: '900', width: 17 },
  itemText: { color: colors.ink, fontSize: 10.5, lineHeight: 15, flex: 1 },
  address: { marginTop: 14, borderTopColor: '#E5DFFF', borderTopWidth: 1, paddingTop: 12 },
  addressHeading: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: colors.brandDark },
  addressText: { fontSize: 11, fontWeight: '800', lineHeight: 16, color: colors.navy, marginTop: 5 },
  share: { backgroundColor: colors.brand, minHeight: 55, borderRadius: 17, marginHorizontal: 5,
    flexDirection: 'row', gap: 11, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  disabled: { opacity: .6 },
  footer: { color: colors.muted, fontSize: 10, textAlign: 'center', lineHeight: 16, marginTop: 8, marginBottom: 6 },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center', marginVertical: 8 },
});
