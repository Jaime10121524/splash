import {useTheme,useThemedStyles} from '../ThemeContext';
import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import {Asset,requestPermissionsAsync} from 'expo-media-library';
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

// Formato de tela vertical (9:16), idêntico no Android e no PNG compartilhado.
const cardWidth = Math.min(Dimensions.get('window').width - 28, 360);
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

function whatsAppMessage(booking: Booking, prettyDate: string): string {
  return [
    'Olá, *' + booking.nome_completo + '*! 💜🌿',
    '',
    'Sua visita ao *SPLASH PARK FAZENDINHA* está confirmada! 🎉',
    '📅 *Data:* ' + prettyDate,
    '👨‍👩‍👧‍👦 *Pessoas:* ' + booking.quantidade_pessoas,
    '🤝 *Corretor responsável:* ' + (booking.captador_nome || 'Equipe Splash'),
    '',
    '☕ Café de boas-vindas para quem chega até as 10h.',
    '🌳 Tour pelo clube e utilização da área rural após o atendimento.',
    '🕗 *Recepção:* das 08h às 18h.',
    '📍 *Endereço:* Estrada do Frutuoso, 315, Santa Cruz, Rio de Janeiro - RJ.',
    '',
    '🎟️ Apresente o voucher com QR Code na recepção. A entrada no parque aquático não está incluída antes da associação.',
    'Esperamos você! 💜',
  ].join('\n');
}

export default function BookingInvite({ booking, onClose }: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const styles=useThemedStyles(lightStyles);
  const {palette}=useTheme();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const date = booking?.data_visita?.split('-') ?? [];
  const prettyDate = date.length === 3 ? date[2] + '/' + date[1] + '/' + date[0] : booking?.data_visita;
  const code = booking?.qr_token ? 'SPLASH:AG:1:' + booking.qr_token : '';

  async function shareVoucher() {
    if (!card.current || !booking || sharing || !code) return;
    setSharing(true);setError('');setHint('');
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setError('Este dispositivo não oferece compartilhamento de arquivos.');
        return;
      }
      // Texto fica na área de transferência ANTES do diálogo de compartilhar.
      // O usuário seleciona o contato/app e cola a mensagem na legenda.
      await Clipboard.setStringAsync(
        whatsAppMessage(booking, prettyDate || booking.data_visita),
      );
      const uri = await captureRef(card.current, {
        format:'png',quality:1,result:'tmpfile',width:1080,height:1920,
      });
      setHint('Texto copiado! Escolha o aplicativo e cole a mensagem na legenda do voucher.');
      await Sharing.shareAsync(uri, {
        mimeType:'image/png',dialogTitle:'Compartilhar voucher Splash',UTI:'public.png',
      });
    } catch (e) {
      setError(e instanceof Error?e.message:'Não foi possível compartilhar o voucher.');
    } finally { setSharing(false); }
  }

  async function saveVoucher() {
    if (!card.current || !booking || sharing || !code) return;
    setSharing(true);setError('');setHint('');
    try {
      // A permissão é SOMENTE de salvar imagens; não é necessário ler fotos.
      const permission=await requestPermissionsAsync(true,['photo']);
      if (!permission.granted) {
        setError('Permita que o Splash salve imagens para baixar o voucher na galeria.');
        return;
      }
      const uri=await captureRef(card.current,{
        format:'png',quality:1,result:'tmpfile',width:1080,height:1920,
      });
      await Asset.create(uri);
      setHint('Voucher salvo na galeria de fotos do celular.');
    } catch (e) {
      setError(e instanceof Error?e.message:'Não foi possível salvar o voucher na galeria.');
    } finally { setSharing(false); }
  }

  return <Modal visible={booking !== null} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Fechar voucher">
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={21} tintColor={palette.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Voucher de visita</Text>
        <View style={styles.close} />
      </View>
      <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
        {booking && <View ref={card} collapsable={false} style={[styles.card, { width: cardWidth }]}>
          <View style={styles.top}>
            <Text style={styles.brand}>SPLASH PARK <Text style={styles.fazendinha}>FAZENDINHA</Text></Text>
            <Text style={styles.tagline}>VOUCHER DE VISITA AGENDADA</Text>
          </View>
          <View style={styles.body}>
            <View style={styles.brokerBox}>
              <Text style={styles.brokerCaption}>VOCÊ SERÁ ATENDIDO PELO CORRETOR:</Text>
              <Text style={styles.brokerName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.75}>
                {booking.captador_nome || 'Corretor responsável'}
              </Text>
            </View>
            <View style={styles.visitBox}>
              <View style={styles.visitDate}>
                <Text style={styles.fieldLabel}>DATA DA VISITA</Text>
                <Text style={styles.dateValue}>{prettyDate}</Text>
              </View>
              <View style={styles.visitCount}>
                <Text style={styles.fieldLabel}>PESSOAS</Text>
                <Text style={styles.dateValue}>{booking.quantidade_pessoas}</Text>
              </View>
            </View>
            <View>
              <Text style={styles.fieldLabel}>NOME DO CLIENTE</Text>
              <Text style={styles.clientName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.8}>
                {booking.nome_completo}
              </Text>
            </View>
            <View style={styles.qrRow}>
              <View style={styles.qrBackground}>
                <QRCode size={117} value={code || 'SPLASH:SEM-CODIGO'}
                  backgroundColor="#FFFFFF" color="#24184E" ecl="M" quietZone={4} />
              </View>
              <View style={styles.qrDetails}>
                <Text style={styles.qrInstruction}>APRESENTE O QR CODE NA RECEPÇÃO</Text>
                <Text style={styles.number}>AGENDAMENTO Nº {booking.id}</Text>
                <Text style={styles.qrNote}>A leitura confirma apenas a chegada.</Text>
              </View>
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
              <Text style={styles.addressHeading}>ENDEREÇO</Text>
              <Text style={styles.addressText}>Estrada do Frutuoso, 315, Santa Cruz, Rio de Janeiro - RJ</Text>
            </View>
          </View>
        </View>}
      </ScrollView>
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {hint !== '' && <Text style={styles.hint} accessibilityRole="text">{hint}</Text>}
      <Pressable onPress={() => { void shareVoucher(); }} disabled={!booking || sharing}
        style={[styles.share, sharing && styles.disabled]} accessibilityRole="button">
        {sharing?<ActivityIndicator color="#FFFFFF"/>:<>
          <SymbolView name={{ios:'square.and.arrow.up',android:'share'}} size={19} tintColor="#FFFFFF"/>
          <Text style={styles.shareText}>Compartilhar voucher</Text>
        </>}
      </Pressable>
      <Pressable onPress={() => { void saveVoucher(); }} disabled={!booking || sharing}
        style={[styles.download, sharing && styles.disabled]} accessibilityRole="button">
        <SymbolView name={{ios:'arrow.down.to.line',android:'download'}} size={20} tintColor={palette.brandDark}/>
        <Text style={[styles.downloadText,{color:palette.brandDark}]}>Baixar imagem</Text>
      </Pressable>
      <Text style={styles.footer}>
        Ao compartilhar, o texto é copiado primeiro. Escolha a conversa e cole na legenda da imagem.
        Ou baixe o PNG diretamente na galeria.
      </Text>
    </SafeAreaView>
  </Modal>;
}

const lightStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  close: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  previewScroll: { flex: 1 },
  previewContent: { alignItems: 'center', paddingBottom: 16 },
  card: { aspectRatio: 9 / 16, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' },
  top: { backgroundColor: colors.navy, height: '10%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  brand: { color: '#FFFFFF', fontWeight: '900', fontSize: 17, textAlign: 'center' },
  fazendinha: { color: '#D7C8FF', fontWeight: '900', fontSize: 14 },
  tagline: { marginTop: 3, color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: .6 },
  body: { flex: 1, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 8, justifyContent: 'space-between' },
  brokerBox: { alignItems: 'center' },
  brokerCaption: { color: colors.brandDark, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  brokerName: { color: colors.navy, fontSize: 18, fontWeight: '900', lineHeight: 20, textAlign: 'center', marginTop: 3 },
  visitBox: { backgroundColor: '#F2EEFF', borderRadius: 10, flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7 },
  visitDate: { flex: 1 },
  visitCount: { minWidth: 74, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: '#DAD0FC' },
  fieldLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: .3 },
  dateValue: { color: colors.navy, fontSize: 14, fontWeight: '900', marginTop: 3 },
  clientName: { color: colors.ink, fontSize: 13, fontWeight: '900', lineHeight: 15, marginTop: 3 },
  qrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  qrBackground: { padding: 3, backgroundColor: '#FFFFFF' },
  qrDetails: { flex: 1, gap: 8 },
  qrInstruction: { color: colors.navy, fontSize: 11, fontWeight: '900', lineHeight: 14 },
  number: { color: colors.brandDark, fontSize: 9.5, fontWeight: '900' },
  qrNote: { color: colors.muted, fontSize: 8.5, lineHeight: 11 },
  section: { borderRadius: 9, backgroundColor: '#F7F5FF', paddingHorizontal: 9, paddingVertical: 6 },
  sectionTitle: { color: colors.navy, fontSize: 11.5, fontWeight: '900', marginBottom: 3 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  itemMarker: { color: colors.brandDark, fontSize: 8.8, lineHeight: 11.5, fontWeight: '900', width: 13 },
  itemText: { color: colors.ink, fontSize: 8.8, lineHeight: 11.5, flex: 1 },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderTopWidth: 1, borderTopColor: '#E5DFFF', paddingTop: 5 },
  addressHeading: { fontSize: 8, fontWeight: '900', color: colors.brandDark, marginTop: 1 },
  addressText: { fontSize: 8.8, fontWeight: '800', lineHeight: 11, color: colors.navy, flex: 1 },
  whatsapp: { backgroundColor: '#177E53', minHeight: 50, borderRadius: 15, marginHorizontal: 5,
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  hint: { backgroundColor: '#EAF5EE', color: '#155C3D', fontSize: 11, fontWeight: '700',
    lineHeight: 16, marginHorizontal: 5, marginBottom: 10, borderRadius: 12, padding: 10 },
  textOnly: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  textOnlyLabel: { color: colors.brandDark, fontSize: 11, fontWeight: '800' },
  download: { backgroundColor: colors.pale, minHeight: 51, borderRadius: 15,
    marginHorizontal:5, marginTop:8, alignItems:'center',justifyContent:'center',
    flexDirection:'row',gap:10 },
  downloadText:{fontSize:13,fontWeight:'900'},
  share: { backgroundColor: colors.brand, minHeight: 55, borderRadius: 17, marginHorizontal: 5,
    flexDirection: 'row', gap: 11, alignItems: 'center', justifyContent: 'center' },
  shareText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  disabled: { opacity: .6 },
  footer: { color: colors.muted, fontSize: 10, textAlign: 'center', lineHeight: 16, marginTop: 8, marginBottom: 6 },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center', marginVertical: 8 },
});
