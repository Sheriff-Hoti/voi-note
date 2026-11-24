import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';

import RootLayout from '@/app/_layout';
import NotesList from '@/app/index';
import Setup from '@/app/setup';

describe('Notes list', () => {
  it('stays reachable from setup while the Speech Model is not installed', async () => {
    await renderRouter({ _layout: RootLayout, index: NotesList, setup: Setup });
    await screen.findByText('Parakeet Unified EN');

    await act(async () => router.back());

    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');

    fireEvent.press(screen.getByText('Set up the Speech Model'));
    expect(await screen.findByText('Parakeet Unified EN')).toBeOnTheScreen();
  });
});
