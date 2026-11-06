import Constants, {ExecutionEnvironment} from 'expo-constants';

/**
 * Somente o cliente Expo Go, que nao possui FCM remoto no Android.
 * expoGoConfig isoladamente nao discrimina o APK standalone com seguranca.
 * Apps standalone/production SEMPRE habilitam a tentativa de registrar FCM.
 */
export const isExpoGo =
  Constants.executionEnvironment !== ExecutionEnvironment.Standalone &&
  Constants.appOwnership === 'expo';
