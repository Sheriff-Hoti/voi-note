import '@/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';

import { checkSherpaRuntime } from '@/lib/sherpa-runtime';
import { NAV_THEME } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

// app.json sets userInterfaceStyle "automatic", so NativeWind's colorScheme follows the system setting.
export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    void checkSherpaRuntime();
  }, []);

  return (
    <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack />
      <PortalHost />
    </ThemeProvider>
  );
}
