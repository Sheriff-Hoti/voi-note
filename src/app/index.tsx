import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useSpeechModel } from '@/lib/speech-model-store';

// Once per app process: after the user goes Back from setup, the list must stay put.
let setupShownThisLaunch = false;

export default function NotesList() {
  const router = useRouter();
  const model = useSpeechModel();
  const needsSetup = model.kind === 'not-installed' || model.kind === 'downloading';

  // Until the Speech Model is installed, launching the app opens the setup screen (instead of
  // Instant Capture). It is pushed over this list, so Back still reaches the Notes.
  useEffect(() => {
    if (model.kind === 'not-installed' && !setupShownThisLaunch) {
      setupShownThisLaunch = true;
      router.push('/setup');
    }
  }, [model.kind, router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Notes' }} />
      <View className="flex-1 items-center justify-center gap-4 bg-background p-4">
        <Text variant="muted">No notes yet</Text>
        {needsSetup && (
          <Button variant="outline" onPress={() => router.push('/setup')}>
            <Text>Set up the Speech Model</Text>
          </Button>
        )}
      </View>
    </>
  );
}
