import { Stack, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { X } from 'lucide-react-native';
import { useEffect, useRef, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, BackHandler, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { elapsed } from '@/lib/format';
import { discardRecording, stopRecording, useCaptureState } from '@/lib/voice-notes-store';

export default function Recording() {
  const router = useRouter();
  const state = useCaptureState();
  const textView = useRef<ComponentRef<typeof ScrollView>>(null);
  // The screen stays on while recording, so it doesn't lock mid-thought.
  useKeepAwake();

  // Leaving would orphan the Recording: Back does nothing until it is Stopped.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => state.kind !== 'idle');
    return () => sub.remove();
  }, [state.kind]);

  const stopping = useRef(false);

  // The 5-minute cap stops the Recording by itself: open its Note as a tapped Stop does.
  useEffect(() => {
    if (state.kind === 'finishing') void stop();
  });

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    try {
      const note = await stopRecording();
      // Nothing was said: there is no Note to open.
      if (note) router.replace({ pathname: '/notes/[id]', params: { id: note.id } });
      else router.back();
    } catch (error) {
      console.error('[recording] Stop failed', error);
      Alert.alert("Couldn't make the Note", error instanceof Error ? error.message : String(error));
      router.back();
    }
  }

  // The notes list shows "Discarded · Undo".
  async function discard() {
    try {
      await discardRecording();
    } catch (error) {
      console.error('[recording] Discard failed', error);
    }
    router.back();
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
            <ScrollView
              className="max-h-64 w-full"
              contentContainerClassName="grow justify-end"
              ref={textView}
              onContentSizeChange={() => textView.current?.scrollToEnd({ animated: false })}
            >
              <Text className="text-lg leading-7">
                {state.kind === 'recording' ? state.textSoFar : ''}
              </Text>
            </ScrollView>
            <View className="flex-row items-center gap-6">
              <Button
                size="icon"
                variant="outline"
                accessibilityLabel="Discard"
                className="h-16 w-16 rounded-full"
                disabled={state.kind !== 'recording'}
                onPress={() => void discard()}
              >
                <Icon as={X} size={28} />
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="h-16 w-40 rounded-full"
                disabled={state.kind !== 'recording'}
                onPress={() => void stop()}
              >
                <Text className="text-lg">Stop</Text>
              </Button>
            </View>
          </>
        )}
      </View>
    </>
  );
}
