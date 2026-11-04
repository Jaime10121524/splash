import ThemeSettings from '../src/components/ThemeSettings';
import {useThemedStyles} from '../src/ThemeContext';
import {useCallback,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SymbolView} from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import {useAuth} from '../src/AuthContext';
import {apiRequest,mobileMediaUrl,roleName,uploadMobilePhoto} from '../src/api';
import {colors} from '../src/theme';

type Profile={perfil:{username:string;email:string;foto_disponivel:boolean}};
export default function ProfileScreen(){
  const s=useThemedStyles(lightStyles);
  const {user,token,logout}=useAuth();
  const [email,setEmail]=useState(''),[username,setUsername]=useState('');
  const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState('');
  const [photo,setPhoto]=useState(false),[photoKey,setPhotoKey]=useState(0);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const result=await apiRequest<Profile>('mobile/me/perfil',{token});
      setUsername(result.perfil.username);setEmail(result.perfil.email);
      setPhoto(result.perfil.foto_disponivel);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Erro ao carregar perfil.');}
    finally{setLoading(false);}
  },[token]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  async function choosePhoto(){
    if(!token||busy)return;
    setError('');setNotice('');
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){setError('Autorize acesso às fotos nas configurações do Android.');return;}
    const picked=await ImagePicker.launchImageLibraryAsync({
      mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.65,
    });
    if(picked.canceled||!picked.assets.length)return;
    setBusy(true);
    try{
      await uploadMobilePhoto('mobile/me/foto',picked.assets[0],token);
      setPhoto(true);setPhotoKey(v=>v+1);setNotice('Sua foto foi atualizada!');
    }catch(e){setError(e instanceof Error?e.message:'Erro ao enviar foto.');}
    finally{setBusy(false);}
  }
  async function save(){
    if(!token||busy)return;
    setError('');setNotice('');
    if(next!==confirm){setError('A confirmação da nova senha não confere.');return;}
    if(!current.trim()){setError('Confirme a senha atual para alterar seus dados.');return;}
    setBusy(true);
    try{
      const result=await apiRequest<{message:string}>('mobile/me/perfil',{
        token,method:'POST',body:{email:email.trim(),senha_atual:current,nova_senha:next}});
      setNotice(result.message);setCurrent('');setNext('');setConfirm('');
    }catch(e){setError(e instanceof Error?e.message:'Erro ao atualizar perfil.');}
    finally{setBusy(false);}
  }
  async function signOut(){
    if(busy)return;
    setBusy(true);setError('');
    try{await logout();router.replace('/login');}
    catch(e){setError(e instanceof Error?e.message:'Falha ao sair.');}
    finally{setBusy(false);}
  }
  const photoUri=token?mobileMediaUrl('mobile/me/foto')+'?v='+photoKey:'';
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.heading}>
        <Pressable onPress={()=>router.back()} style={s.back} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'arrow.left',android:'arrow_back'}} size={21} tintColor={colors.ink}/>
        </Pressable><View><Text style={s.kicker}>SUA CONTA</Text><Text style={s.title}>Meu perfil</Text></View>
      </View>
      {loading?<ActivityIndicator color={colors.brand} style={{marginVertical:45}}/>:null}
      <View style={s.card}>
        <View style={s.avatar}>
          {photo&&token?<Image source={{uri:photoUri,headers:{Authorization:'Bearer '+token}}}
            style={s.photo} onError={()=>setPhoto(false)}/>:
            <Text style={s.avatarLetter}>{username.slice(0,1).toUpperCase()||'?'}</Text>}
        </View>
        <Text style={s.username}>{username||user?.username}</Text>
        <Text style={s.subtitle}>{roleName(user?.role||'')}</Text>
        <Pressable style={s.photoButton} disabled={busy} onPress={()=>{void choosePhoto();}}>
          <SymbolView name={{ios:'camera.fill',android:'add_a_photo'}} size={18} tintColor={colors.brandDark}/>
          <Text style={s.photoButtonText}>Alterar foto de perfil</Text>
        </Pressable>
        <Text style={s.caption}>JPG, PNG ou WebP · até 2 MB</Text>
      </View>
      <View style={s.card}>
        <Text style={s.section}>Dados de acesso</Text>
        <Text style={s.label}>Usuário</Text>
        <Text style={s.disabledInput}>{username||user?.username}</Text>
        <Text style={s.label}>E-mail de recuperação *</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          placeholder="Seu e-mail"/>
        <Text style={s.hint}>Para alterar e-mail ou senha, informe a senha atual.</Text>
        <Text style={s.label}>Senha atual *</Text>
        <TextInput style={s.input} value={current} onChangeText={setCurrent}
          secureTextEntry placeholder="Senha atual"/>
        <Text style={s.label}>Nova senha (opcional)</Text>
        <TextInput style={s.input} value={next} onChangeText={setNext}
          secureTextEntry placeholder="Mínimo 8 caracteres, maiúscula e número"/>
        <Text style={s.label}>Confirmar nova senha</Text>
        <TextInput style={s.input} value={confirm} onChangeText={setConfirm}
          secureTextEntry placeholder="Repita a nova senha"/>
        <Pressable style={[s.save,busy&&s.faded]} disabled={busy} onPress={()=>{void save();}}>
          {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={s.saveText}>Salvar alterações</Text>}
        </Pressable>
      </View>
      {!!notice&&<View style={s.success}><Text style={s.successText}>{notice}</Text></View>}
      {!!error&&<View style={s.error}><Text style={s.errorText}>{error}</Text></View>}
      <ThemeSettings/>
      <Pressable style={[s.logout,busy&&s.faded]} onPress={()=>{void signOut();}} disabled={busy}>
        <SymbolView name={{ios:'rectangle.portrait.and.arrow.right',android:'logout'}} size={20} tintColor={colors.danger}/>
        <Text style={s.logoutText}>Sair da conta</Text>
      </Pressable>
      <Text style={s.footer}>Splash Next · Sua conta protegida</Text>
    </ScrollView>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:19,paddingBottom:65,gap:15},
  heading:{flexDirection:'row',alignItems:'center',gap:13,marginBottom:6},
  back:{width:44,height:44,borderRadius:14,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  kicker:{color:colors.brandDark,fontWeight:'900',fontSize:10,letterSpacing:1.2},
  title:{fontSize:26,fontWeight:'900',color:colors.ink},
  card:{backgroundColor:'#FFFFFF',borderRadius:23,padding:21,gap:11,alignItems:'stretch'},
  avatar:{width:102,height:102,borderRadius:35,overflow:'hidden',backgroundColor:colors.pale,alignSelf:'center',
    alignItems:'center',justifyContent:'center'},
  photo:{width:'100%',height:'100%'},
  avatarLetter:{color:colors.brandDark,fontSize:36,fontWeight:'900'},
  username:{fontSize:21,fontWeight:'900',color:colors.ink,textAlign:'center'},
  subtitle:{fontSize:12,color:colors.muted,textAlign:'center'},
  photoButton:{flexDirection:'row',alignSelf:'center',alignItems:'center',padding:13,
    backgroundColor:colors.pale,borderRadius:13,gap:8,marginTop:5},
  photoButtonText:{fontSize:13,fontWeight:'900',color:colors.brandDark},
  caption:{textAlign:'center',fontSize:10,color:colors.muted},
  section:{fontSize:16,fontWeight:'900',color:colors.ink,marginBottom:4},
  label:{fontSize:11,fontWeight:'800',color:colors.muted},
  input:{height:48,paddingHorizontal:13,backgroundColor:'#FAFAFF',borderRadius:12,
    borderColor:colors.line,borderWidth:1,color:colors.ink,fontSize:14},
  disabledInput:{padding:13,backgroundColor:colors.pale,borderRadius:12,color:colors.muted},
  hint:{color:colors.muted,fontSize:11,lineHeight:18},
  save:{backgroundColor:colors.brand,minHeight:50,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:6},
  saveText:{color:'#FFFFFF',fontWeight:'900',fontSize:14},
  success:{padding:13,backgroundColor:'#EAF8EF',borderRadius:13},
  successText:{color:'#167046',fontSize:12},
  error:{padding:13,backgroundColor:'#FFF0EB',borderRadius:13},
  errorText:{color:colors.danger,fontSize:12},
  logout:{backgroundColor:'#FFFFFF',borderRadius:15,borderWidth:1,borderColor:'#F3CFD7',
    padding:17,flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center'},
  logoutText:{color:colors.danger,fontWeight:'900',fontSize:14},
  faded:{opacity:.5},
  footer:{textAlign:'center',color:colors.muted,fontSize:11,marginTop:10},
});
