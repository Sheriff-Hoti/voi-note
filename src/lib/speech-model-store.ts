import { useSyncExternalStore } from 'react';

import { speechModelInstaller, type DownloadProgress } from '@/model-installer';

export type SpeechModelState =
  | { kind: 'checking' }
  | { kind: 'not-installed'; error?: string }
  | { kind: 'downloading'; progress: DownloadProgress | null }
  | { kind: 'installed' };

// Glue between the model installer and the screens: one shared state, so a download keeps showing
// its progress when the user leaves the setup screen and comes back.
let state: SpeechModelState = { kind: 'checking' };
let checked = false;
const listeners = new Set<() => void>();

function set(next: SpeechModelState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!checked) {
    checked = true;
    speechModelInstaller.status().then(
      (status) => set({ kind: status }),
      (error) => {
        // Not a failed download: offer a plain Download, and keep the cause in the logs.
        console.error('[speech-model] status check failed', error);
        set({ kind: 'not-installed' });
      }
    );
  }
  return () => listeners.delete(listener);
}

export async function downloadSpeechModel(): Promise<void> {
  if (state.kind === 'downloading' || state.kind === 'installed') return;
  set({ kind: 'downloading', progress: null });
  try {
    await speechModelInstaller.download((progress) => set({ kind: 'downloading', progress }));
    set({ kind: 'installed' });
  } catch (error) {
    set({ kind: 'not-installed', error: error instanceof Error ? error.message : String(error) });
  }
}

export function useSpeechModel(): SpeechModelState {
  return useSyncExternalStore(subscribe, () => state);
}
