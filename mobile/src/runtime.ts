import Constants, {ExecutionEnvironment} from 'expo-constants';

/**
 * Expo Go nao suporta push remoto Android (SDK 53+).
 * `executionEnvironment` e a identificacao oficial; `appOwnership` fica
 * apenas como compatibilidade com instalacoes antigas.
 *
 * Development builds e APKs standalone permanecem habilitados para FCM.
 */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === 'expo';
