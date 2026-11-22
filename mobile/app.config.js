// Firebase Android e acesso HTTP a IP privado EXCLUSIVAMENTE no APK preview.
// Em producao usesCleartextTraffic=false e a API exige HTTPS.
module.exports = ({config}) => {
  const allowLanHttp =
    process.env.EXPO_PUBLIC_SPLASH_ALLOW_LAN_HTTP === 'true' &&
    process.env.EAS_BUILD_PROFILE === 'preview';

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    },
    plugins: [
      ...(config.plugins || []),
      ['expo-build-properties', {
        android: {usesCleartextTraffic: allowLanHttp},
      }],
    ],
  };
};
