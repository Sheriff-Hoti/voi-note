import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, BackHandler, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { elapsed } from '@/lib/format';
import { stopRecording, useCaptureState } from '@/lib/voice-notes-store';

export default function Recording() {
  const router = useRouter();
  const state = useCaptureState();

  // Leaving would orphan the Recording: Back does nothing until it is Stopped.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => state.kind !== 'idle');
    return () => sub.remove();
  }, [state.kind]);

  async function stop() {
    try {
      const note = await stopRecording();
      router.replace({ pathname: '/notes/[id]', params: { id: note.id } });
    } catch (error) {
      console.error('[recording] Stop failed', error);
      Alert.alert("Couldn't make the Note", error instanceof Error ? error.message : String(error));
      router.back();
    }
  }

  return (
    <>
      <Stack.Screen
        options={{ title: 'Recording', headerBackVisible: false, gestureEnabled: false }}
      />
      <View className="flex-1 items-center justify-center gap-10 bg-background p-6">
        {state.kind === 'finishing' ? (
          <View className="items-center gap-4">
            <ActivityIndicator size="large" />
            <Text variant="muted">Transcribing…</Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center gap-3">
              <View className="h-4 w-4 rounded-full bg-red-500" />
              <Text className="text-lg font-semibold">Recording</Text>
            </View>
            <Text className="text-6xl font-light tabular-nums">
              {elapsed(state.kind === 'recording' ? state.elapsedMs : 0)}
            </Text>
            <Button
              size="lg"
              variant="destructive"
              className="h-16 w-40 rounded-full"
              disabled={state.kind !== 'recording'}
              onPress={() => void stop()}
            >
              <Text className="text-lg">Stop</Text>
            </Button>
          </>
        )}
      </View>
    </>
  );
}
