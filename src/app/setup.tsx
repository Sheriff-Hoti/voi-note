import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { checkMicPermission, requestMicPermission, type MicPermission } from '@/lib/mic-permission';
import {
  cancelSpeechModelDownload,
  deleteSpeechModel,
  downloadSpeechModel,
  useSpeechModel,
  type SpeechModelState,
} from '@/lib/speech-model-store';
import {
  PARAKEET_UNIFIED_EN,
  PARAKEET_UNIFIED_EN_BYTES,
  type DownloadProgress,
} from '@/model-installer';

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
  const size = `${mb(PARAKEET_UNIFIED_EN_BYTES)} MB`;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="font-semibold">{PARAKEET_UNIFIED_EN.label}</Text>
          <Text variant="muted">Speech Model · English · {size}</Text>
        </View>
        {model.kind === 'installed' && <Text variant="muted">Installed</Text>}
        {model.kind === 'not-installed' && model.problem?.kind !== 'mobile-data' && (
          <Button onPress={() => void downloadSpeechModel()}>
            <Text>{downloadLabel(model)}</Text>
          </Button>
        )}
        {model.kind === 'downloading' && (
          <Button variant="outline" onPress={cancelSpeechModelDownload}>
            <Text>Cancel</Text>
          </Button>
        )}
      </View>
      {model.kind === 'downloading' && <DownloadProgressView progress={model.progress} />}
      {model.kind === 'not-installed' && <NotInstalledDetails model={model} size={size} />}
      {model.kind === 'installed' && (
        <Button variant="outline" className="self-start" onPress={confirmDelete}>
          <Text>Delete Speech Model</Text>
        </Button>
      )}
    </View>
  );
}

type NotInstalled = Extract<SpeechModelState, { kind: 'not-installed' }>;

function downloadLabel(model: NotInstalled) {
  if (model.problem?.kind === 'failed' || model.problem?.kind === 'no-space') return 'Retry';
  return model.bytesDownloaded > 0 ? 'Resume' : 'Download';
}

function NotInstalledDetails({ model, size }: { model: NotInstalled; size: string }) {
  const { problem, bytesDownloaded } = model;
  return (
    <>
      {bytesDownloaded > 0 && (
        <View className="flex-row items-center justify-between gap-4">
          <Text variant="muted">
            {mb(bytesDownloaded)} of {size} downloaded
          </Text>
          <Text className="text-sm underline" onPress={() => void deleteSpeechModel()}>
            Delete
          </Text>
        </View>
      )}
      {problem?.kind === 'mobile-data' && (
        <View className="gap-3 rounded-md border border-border p-4">
          <Text>
            You&apos;re on mobile data. The rest of the download is{' '}
            {mb(PARAKEET_UNIFIED_EN_BYTES - bytesDownloaded)} MB.
          </Text>
          <View className="flex-row gap-3">
            <Button onPress={() => void downloadSpeechModel({ allowMobileData: true })}>
              <Text>Download anyway</Text>
            </Button>
          </View>
        </View>
      )}
      {problem?.kind === 'no-space' && (
        <Text className="text-sm text-destructive">
          {problem.message}. Free up space, then retry.
        </Text>
      )}
      {problem?.kind === 'failed' && (
        <Text className="text-sm text-destructive">Download failed: {problem.message}</Text>
      )}
    </>
  );
}

function confirmDelete() {
  Alert.alert(
    'Delete the Speech Model?',
    'Recording needs it. You can download it again from this screen.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteSpeechModel() },
    ]
  );
}

function DownloadProgressView({ progress }: { progress: DownloadProgress | null }) {
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
