import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.naildash.pdv',
  appName: 'NailDash',
  webDir: 'apk-www',
  server: {
    url: 'https://naildash.netlify.app',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
