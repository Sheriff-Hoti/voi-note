import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '@/app/_layout';
import NotesList from '@/app/index';

describe('Notes list', () => {
  it('shows "No notes yet" when the app opens with no Notes', async () => {
    await renderRouter({ _layout: RootLayout, index: NotesList });

    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
  });
});
