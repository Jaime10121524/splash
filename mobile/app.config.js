// Firebase Android: GOOGLE_SERVICES_JSON e um arquivo seguro do EAS Build.
// Em desenvolvimento, coloque google-services.json na pasta mobile (ignorado no Git).
module.exports = ({config}) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
  },
});
