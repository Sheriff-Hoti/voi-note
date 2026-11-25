import { useSyncExternalStore } from 'react';

import {
  DownloadCancelledError,
  DownloadFailedError,
  MobileDataError,
  NotEnoughSpaceError,
  speechModelInstaller,
  type DownloadProgress,
} from '@/model-installer';

/** Why the last download did not start or did not finish. */
export type DownloadProblem =
  | { kind: 'mobile-data' }
  | { kind: 'no-space'; message: string }
  | { kind: 'failed'; message: string };

export type SpeechModelState =
  | { kind: 'checking' }
  | { kind: 'not-installed'; bytesDownloaded: number; problem?: DownloadProblem }
  | { kind: 'downloading'; progress: DownloadProgress | null }
  | { kind: 'installed' };

// Glue between the model installer and the screens: one shared state, so a download keeps showing
// its progress when the user leaves the setup screen and comes back.
let state: SpeechModelState = { kind: 'checking' };
let firstCheck: Promise<void> | null = null;
// Once the user chooses to download on mobile data, a later Retry or Resume in this session doesn't ask again.
let mobileDataAllowed = false;
const listeners = new Set<() => void>();

function set(next: SpeechModelState) {
  state = next;
  listeners.forEach((l) => l());
}

async function refresh(problem?: DownloadProblem) {
  try {
    const status = await speechModelInstaller.status();
    set(status.kind === 'installed' ? status : { ...status, problem });
  } catch (error) {
    // Not a failed download: offer a plain Download, and keep the cause in the logs.
    console.error('[speech-model] status check failed', error);
    set({ kind: 'not-installed', bytesDownloaded: 0, problem });
  }
}

function checkOnce(): Promise<void> {
  firstCheck ??= refresh();
  return firstCheck;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void checkOnce();
  return () => listeners.delete(listener);
}

/** Whether the Speech Model is installed, once the first status check is done. */
export async function isSpeechModelInstalled(): Promise<boolean> {
  await checkOnce();
  return state.kind === 'installed';
}

/** `allowMobileData`: the user saw the mobile-data warning and chose to continue. */
export async function downloadSpeechModel({ allowMobileData = false } = {}): Promise<void> {
  if (state.kind !== 'not-installed') return;
  mobileDataAllowed ||= allowMobileData;
  set({ kind: 'downloading', progress: null });
  try {
    await speechModelInstaller.download({
      allowMobileData: mobileDataAllowed,
      onProgress: (progress) => set({ kind: 'downloading', progress }),
    });
    set({ kind: 'installed' });
  } catch (error) {
    await refresh(problemOf(error));
  }
}

function problemOf(error: unknown): DownloadProblem | undefined {
  if (error instanceof DownloadCancelledError) return undefined;
  if (error instanceof MobileDataError) return { kind: 'mobile-data' };
  if (error instanceof NotEnoughSpaceError) return { kind: 'no-space', message: error.message };
  console.error('[speech-model] download failed', error);
  if (error instanceof DownloadFailedError) {
    return { kind: 'failed', message: "can't reach the download server. Check your connection." };
  }
  return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
}

/** Stops the download. What was downloaded is kept, so the next download resumes. */
export function cancelSpeechModelDownload(): void {
  speechModelInstaller.cancel();
}

/** Removes the installed Speech Model, or what a stopped download left. */
export async function deleteSpeechModel(): Promise<void> {
  if (state.kind === 'downloading' || state.kind === 'checking') return;
  await speechModelInstaller.delete();
  await refresh();
}

export function useSpeechModel(): SpeechModelState {
  return useSyncExternalStore(subscribe, () => state);
}
