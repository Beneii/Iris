import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.airis.app',
  appName: 'Iris',
  webDir: 'out',
  server: {
    url: 'http://100.121.197.106:8643',
    cleartext: true,
  },
  ios: {
    backgroundColor: '#111113',
    contentInset: 'always',
    scrollEnabled: true,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    Keyboard: {
      resize: 'native' as any,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK' as any,
      backgroundColor: '#111113',
      overlaysWebView: true,
    },
    SplashScreen: {
      launchShowDuration: 300,
      backgroundColor: '#111113',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#111113',
    },
  },
};

export default config;
