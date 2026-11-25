import { Stack, useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { firstLine, noteDate } from '@/lib/format';
import { checkMicPermission, requestMicPermission } from '@/lib/mic-permission';
import { useSpeechModel } from '@/lib/speech-model-store';
import {
  launchApp,
  startRecording,
  undoDiscard,
  useCaptureState,
  useNotes,
} from '@/lib/voice-notes-store';
import type { Note } from '@/voice-notes';

// Once per app process: after the user goes Back from setup, the list must stay put.
let setupShownThisLaunch = false;
let recordingShownThisLaunch = false;

export default function NotesList() {
  const router = useRouter();
  const model = useSpeechModel();
  const notes = useNotes();
  const needsSetup = model.kind === 'not-installed' || model.kind === 'downloading';

  // Until the Speech Model is installed, launching the app opens the setup screen (instead of
  // Instant Capture). It is pushed over this list, so Back still reaches the Notes.
  useEffect(() => {
    if (model.kind === 'not-installed' && !setupShownThisLaunch) {
      setupShownThisLaunch = true;
      router.push('/setup');
    }
  }, [model.kind, router]);

  // Instant Capture: the Recording the launch started gets its screen, once.
  useEffect(() => {
    launchApp().then(
      (recording) => {
        if (recording && !recordingShownThisLaunch) {
          recordingShownThisLaunch = true;
          router.push('/recording');
        }
      },
      () => {} // Logged where it starts, in the root layout.
    );
  }, [router]);

  async function record() {
    if ((await checkMicPermission()) !== 'granted') {
      const permission = await requestMicPermission();
      if (permission !== 'granted') {
        Alert.alert('Microphone needed', 'voi-note needs the microphone to record.', [
          { text: 'Cancel', style: 'cancel' },
          ...(permission === 'blocked'
            ? [{ text: 'Open settings', onPress: () => void Linking.openSettings() }]
            : []),
        ]);
        return;
      }
    }
    try {
      await startRecording();
      router.push('/recording');
    } catch (error) {
      console.error('[recording] could not start', error);
      Alert.alert(
        "Couldn't start recording",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notes',
          // Once installed, setup is still where the Speech Model can be deleted.
          headerRight: () =>
            model.kind === 'installed' && (
              <Button variant="ghost" size="sm" onPress={() => router.push('/setup')}>
                <Text>Speech Model</Text>
              </Button>
            ),
        }}
      />
      <View className="flex-1 bg-background">
        <FlatList
          data={notes ?? []}
          keyExtractor={(note) => note.id}
          renderItem={({ item }) => <NoteRow note={item} />}
          contentContainerClassName="grow pb-36"
          ListEmptyComponent={
            notes ? (
              <View className="flex-1 items-center justify-center gap-4 p-4">
                <Text variant="muted">No notes yet</Text>
                {needsSetup && (
                  <Button variant="outline" onPress={() => router.push('/setup')}>
                    <Text>Set up the Speech Model</Text>
                  </Button>
                )}
              </View>
            ) : undefined
          }
        />
        <DiscardedSnackbar />
        {model.kind === 'installed' && (
          <View className="absolute bottom-10 left-0 right-0 items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Record"
              onPress={() => void record()}
              className="h-20 w-20 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
            >
              <Icon as={Mic} size={36} className="text-primary-foreground" />
            </Pressable>
          </View>
        )}
      </View>
    </>
  );
}

/** "Discarded · Undo" for the Undo window after a Discard; Undo opens the Note as Stop would. */
function DiscardedSnackbar() {
  const router = useRouter();
  const state = useCaptureState();
  const [undoing, setUndoing] = useState(false);

  async function undo() {
    setUndoing(true);
    try {
      const note = await undoDiscard();
      if (note) router.push({ pathname: '/notes/[id]', params: { id: note.id } });
    } catch (error) {
      console.error('[notes] Undo failed', error);
      Alert.alert("Couldn't make the Note", error instanceof Error ? error.message : String(error));
    } finally {
      setUndoing(false);
    }
  }

  if (state.kind !== 'discarded' && !undoing) return null;
  return (
    <View className="absolute bottom-36 left-4 right-4 flex-row items-center justify-between rounded-lg bg-foreground px-4 py-2 shadow-lg">
      <Text className="text-background">{undoing ? 'Transcribing…' : 'Discarded'}</Text>
      {!undoing && (
        <Button variant="ghost" size="sm" onPress={() => void undo()}>
          <Text className="font-semibold text-background">Undo</Text>
        </Button>
      )}
    </View>
  );
}

function NoteRow({ note }: { note: Note }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/notes/[id]', params: { id: note.id } })}
      className="gap-1 border-b border-border px-4 py-3 active:bg-accent"
    >
      <Text variant="muted">{noteDate(note.createdAt)}</Text>
      <Text numberOfLines={1}>{firstLine(note.text) || 'No words'}</Text>
    </Pressable>
  );
}
