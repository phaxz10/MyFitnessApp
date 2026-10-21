import type { CapacitorConfig } from '@capacitor/cli';

// Native iOS/Android shell around the Vite build (`pnpm build` -> dist/).
// Workflow: `pnpm cap:sync`, then open ios/ in Xcode or android/ in Android Studio.
const config: CapacitorConfig = {
  appId: 'app.mypersonalfitness',
  appName: 'MyPersonalFitness',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      iconColor: '#1572ae',
    },
  },
};

export default config;
