import { renderRouter, screen } from 'expo-router/testing-library';

import RootLayout from '@/app/_layout';
import NotesList from '@/app/index';
import Setup from '@/app/setup';

describe('First launch', () => {
  it('opens the setup screen with the Speech Model row and its size', async () => {
    await renderRouter({ _layout: RootLayout, index: NotesList, setup: Setup });

    expect(await screen.findByText('Parakeet Unified EN')).toBeOnTheScreen();
    expect(screen.getByText('Speech Model · English · 663 MB')).toBeOnTheScreen();
    expect(screen.getByText('Download')).toBeOnTheScreen();
    expect(screen).toHavePathname('/setup');
  });
});
