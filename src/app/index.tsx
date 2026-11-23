import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function NotesList() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notes' }} />
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text variant="muted">No notes yet</Text>
      </View>
    </>
  );
}
