import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { checkMicPermission, requestMicPermission, type MicPermission } from '@/lib/mic-permission';
import { downloadSpeechModel, useSpeechModel } from '@/lib/speech-model-store';
import { PARAKEET_UNIFIED_EN, PARAKEET_UNIFIED_EN_BYTES } from '@/model-installer';

const mb = (bytes: number) => Math.round(bytes / 1e6).toLocaleString('en-US');

export default function Setup() {
  return (
    <>
      <Stack.Screen options={{ title: 'Setup' }} />
      <View className="flex-1 gap-8 bg-background p-6">
        <MicRow />
        <SpeechModelRow />
      </View>
    </>
  );
}

function MicRow() {
  const [permission, setPermission] = useState<MicPermission | null>(null);

  useEffect(() => {
    void checkMicPermission().then(setPermission);
  }, []);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="font-semibold">Microphone</Text>
          <Text variant="muted">Needed to record.</Text>
        </View>
        {permission === 'granted' ? (
          <Text variant="muted">Allowed</Text>
        ) : (
          <Button
            variant="outline"
            onPress={async () => setPermission(await requestMicPermission())}
            disabled={permission === null}
          >
            <Text>Allow</Text>
          </Button>
        )}
      </View>
      {permission === 'blocked' && (
        <Text variant="muted">
          Android won&apos;t ask again.{' '}
          <Text className="text-sm underline" onPress={() => void Linking.openSettings()}>
            Open settings
          </Text>{' '}
          to allow the microphone.
        </Text>
      )}
    </View>
  );
}

function SpeechModelRow() {
  const model = useSpeechModel();

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="font-semibold">{PARAKEET_UNIFIED_EN.label}</Text>
          <Text variant="muted">Speech Model · English · {mb(PARAKEET_UNIFIED_EN_BYTES)} MB</Text>
        </View>
        {model.kind === 'installed' && <Text variant="muted">Installed</Text>}
        {model.kind === 'not-installed' && (
          <Button onPress={() => void downloadSpeechModel()}>
            <Text>{model.error ? 'Retry' : 'Download'}</Text>
          </Button>
        )}
      </View>
      {model.kind === 'downloading' && <DownloadProgressView progress={model.progress} />}
      {model.kind === 'not-installed' && model.error && (
        <Text className="text-sm text-destructive">Download failed: {model.error}</Text>
      )}
    </View>
  );
}

function DownloadProgressView({
  progress,
}: {
  progress: { phase: 'downloading' | 'verifying'; bytesDone: number; bytesTotal: number } | null;
}) {
  const done = progress?.bytesDone ?? 0;
  const total = progress?.bytesTotal ?? PARAKEET_UNIFIED_EN_BYTES;
  const percent = Math.floor((done / total) * 100);
  return (
    <View className="gap-2">
      <Progress value={percent} />
      <Text variant="muted">
        {progress?.phase === 'verifying' ? 'Verifying… ' : ''}
        {mb(done)} / {mb(total)} MB · {percent}%
      </Text>
    </View>
  );
}
