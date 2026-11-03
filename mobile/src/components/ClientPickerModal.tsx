import { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { apiRequest, type MobileClient } from '../api';
import { maskPhoneBR } from '../phone';
import { colors } from '../theme';

export default function ClientPickerModal({
  visible, token, title = 'Quem indicou?', onChoose, onClose, omitId,
}: {
  visible: boolean;
  token: string | null;
  title?: string;
  omitId?: number;
  onChoose: (client: MobileClient | null) => void;
  onClose: () => void;
}) {
  const [search,setSearch] = useState('');
  const [clients,setClients] = useState<MobileClient[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => {
    if (!visible) { setSearch('');setClients([]);setError('');return; }
    if (!token || search.trim().length < 2) {setClients([]);return;}
    let current = true;
    const timer=setTimeout(() => {
      setLoading(true);
      apiRequest<{clientes:MobileClient[]}>('mobile/clientes?q='+encodeURIComponent(search.trim()),{token})
        .then(r=>{if(current){setClients(r.clientes.filter(c=>c.id!==omitId));setError('');}})
        .catch(e=>{if(current)setError(e instanceof Error?e.message:'Erro na pesquisa.');})
        .finally(()=>{if(current)setLoading(false);});
    },280);
    return ()=>{current=false;clearTimeout(timer);};
  },[visible,search,token,omitId]);

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS==='ios'?'padding':'height'}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fechar seleção"/>
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <View style={styles.handle}/>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>CADASTRO DE CLIENTES</Text><Text style={styles.title}>{title}</Text></View>
          <Pressable onPress={onClose} accessibilityLabel="Fechar" style={styles.close}>
            <SymbolView name={{ios:'xmark',android:'close'}} tintColor={colors.muted} size={20}/>
          </Pressable>
        </View>
        <View style={styles.search}>
          <SymbolView name={{ios:'magnifyingglass',android:'search'}} tintColor={colors.brandDark} size={20}/>
          <TextInput autoFocus style={styles.input} placeholder="Nome, telefone ou CPF"
            placeholderTextColor={colors.muted} value={search} onChangeText={setSearch}
            autoCorrect={false} returnKeyType="search"/>
          {loading&&<ActivityIndicator color={colors.brand} size="small"/>}
        </View>
        <ScrollView style={styles.list} contentContainerStyle={styles.items} keyboardShouldPersistTaps="handled">
          {search.trim().length<2?<Text style={styles.hint}>Digite ao menos duas letras para buscar o indicador cadastrado.</Text>:
            !clients.length&&!loading?<Text style={styles.hint}>Nenhum cliente encontrado.</Text>:null}
          {!!error&&<Text style={styles.error}>{error}</Text>}
          {clients.map(c=><Pressable key={c.id} onPress={()=>{onChoose(c);onClose();}} style={styles.item}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{c.nome.slice(0,1).toUpperCase()}</Text></View>
            <View style={styles.info}><Text style={styles.name}>{c.nome}</Text>
              <Text style={styles.phone}>{c.telefone?maskPhoneBR(c.telefone):'Sem telefone'}</Text></View>
            <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} tintColor="#B9ACDE" size={20}/>
          </Pressable>)}
        </ScrollView>
        <Pressable onPress={()=>{onChoose(null);onClose();}} style={styles.none}>
          <Text style={styles.noneText}>Nenhum indicador</Text>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles=StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end'},
  scrim:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'rgba(30,19,61,.54)'},
  sheet:{backgroundColor:'#FFFFFF',borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:'88%',minHeight:340,paddingHorizontal:20},
  handle:{width:45,height:5,backgroundColor:'#DBD5EC',borderRadius:6,marginTop:12,alignSelf:'center'},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:17,marginBottom:15},
  eyebrow:{color:colors.brandDark,fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{fontSize:20,fontWeight:'900',color:colors.ink,marginTop:5},
  close:{width:37,height:37,borderRadius:13,backgroundColor:colors.background,alignItems:'center',justifyContent:'center'},
  search:{backgroundColor:'#F8F6FF',borderRadius:15,borderWidth:1,borderColor:'#DBD1FF',height:52,
    flexDirection:'row',gap:9,alignItems:'center',paddingHorizontal:13},
  input:{flex:1,color:colors.ink,fontSize:13,height:'100%'},
  list:{flexGrow:0,maxHeight:360},
  items:{paddingTop:12,paddingBottom:13},
  hint:{fontSize:12,color:colors.muted,lineHeight:19,padding:13},
  error:{fontSize:12,color:'#A45A3A',padding:12},
  item:{minHeight:59,borderBottomWidth:1,borderBottomColor:colors.line,flexDirection:'row',gap:11,alignItems:'center'},
  avatar:{width:39,height:39,backgroundColor:colors.pale,borderRadius:13,alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.brandDark,fontSize:17,fontWeight:'900'},
  info:{flex:1},
  name:{fontSize:13,fontWeight:'800',color:colors.ink},
  phone:{fontSize:11,color:colors.muted,marginTop:5},
  none:{minHeight:48,alignItems:'center',justifyContent:'center'},
  noneText:{color:colors.brandDark,fontWeight:'800',fontSize:13},
});
