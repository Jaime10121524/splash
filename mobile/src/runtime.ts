import Constants from 'expo-constants';

/**
 * Expo Go nao possui modulo Android FCM de notificacoes remotas.
 * expoGoConfig e preenchido somente no cliente Expo Go, nao no APK
 * proprio nem em development builds com o expo-dev-client.
 */
export const isExpoGo = Constants.expoGoConfig != null || Constants.appOwnership === 'expo';
