import type { CapacitorConfig } from '@capacitor/cli'

// Os arquivos do frontend são EMBUTIDOS no APK/IPA. Não usar server.url:
// a documentação do Capacitor reserva server.url para live reload.
const config: CapacitorConfig = {
  appId: 'br.com.ahritech.splash', // Identificador provisório; confirmar antes da publicação.
  appName: 'SPLASH',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      // Exibe aviso e som também quando o aplicativo está aberto.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
