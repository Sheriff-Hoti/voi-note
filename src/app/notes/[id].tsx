import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { noteDate } from '@/lib/format';
import { useNote } from '@/lib/voice-notes-store';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const note = useNote(id);

  return (
    <>
      <Stack.Screen options={{ title: note ? noteDate(note.createdAt) : 'Note' }} />
      {note === undefined ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView className="flex-1 bg-background" contentContainerClassName="p-6">
          <Text className="text-lg leading-7">
            {note ? note.text || 'No words' : 'No such Note'}
          </Text>
        </ScrollView>
      )}
    </>
  );
}
