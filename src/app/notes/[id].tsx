import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { noteDate } from '@/lib/format';
import { deleteNote, editNote, shareText, useNote } from '@/lib/voice-notes-store';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const note = useNote(id);

  async function share() {
    try {
      await Share.share({ message: await shareText(id) });
    } catch (error) {
      reportFailure('sharing', "Couldn't share the Note", error);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete note?', 'Its audio is deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Back first: once deleted, this screen would show "No such Note" on its way out.
          router.back();
          deleteNote(id).catch((error: unknown) =>
            reportFailure('deleting', "Couldn't delete the Note", error)
          );
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: note ? noteDate(note.createdAt) : 'Note',
          headerRight: () =>
            note && (
              <View className="flex-row">
                <Button variant="ghost" size="icon" accessibilityLabel="Share" onPress={share}>
                  <Icon as={Share2} size={22} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  accessibilityLabel="Delete"
                  onPress={confirmDelete}
                >
                  <Icon as={Trash2} size={22} />
                </Button>
              </View>
            ),
        }}
      />
      {note === undefined ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      ) : note ? (
        <NoteEditor id={note.id} initialText={note.text} />
      ) : (
        <View className="flex-1 bg-background p-6">
          <Text className="text-lg">No such Note</Text>
        </View>
      )}
    </>
  );
}

function reportFailure(action: string, title: string, error: unknown) {
  console.error(`[notes] ${action} failed`, error);
  Alert.alert(title, error instanceof Error ? error.message : String(error));
}

/** The Note's text, saved on every change: an edit is kept even if the app is killed right after. */
function NoteEditor({ id, initialText }: { id: string; initialText: string }) {
  // Owned here once loaded: the saved copy reloads after each save and would move the cursor.
  const [text, setText] = useState(initialText);
  const [saveFailed, setSaveFailed] = useState(false);

  function change(next: string) {
    setText(next);
    editNote(id, next).then(
      () => setSaveFailed(false),
      (error: unknown) => {
        console.error('[notes] saving the edit failed', error);
        setSaveFailed(true);
      }
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow p-6"
      keyboardShouldPersistTaps="handled"
    >
      {saveFailed && <Text className="mb-2 text-destructive">{"Couldn't save the last edit"}</Text>}
      <TextInput
        value={text}
        onChangeText={change}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        placeholder="No words"
        accessibilityLabel="Note text"
        className="grow text-lg leading-7 text-foreground"
        placeholderClassName="text-muted-foreground"
      />
    </ScrollView>
  );
}
