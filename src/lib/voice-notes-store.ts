import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { checkMicPermission } from '@/lib/mic-permission';
import { isSpeechModelInstalled } from '@/lib/speech-model-store';

import { voiceNotes, type CaptureState, type Note } from '@/voice-notes';

/** Glue between the voice-notes core and the screens. No behaviour lives here. */

export function useCaptureState(): CaptureState {
  return useSyncExternalStore(voiceNotes.subscribe, voiceNotes.getState);
}

/** Every Note, newest first; null until first loaded. Follows changes. */
export function useNotes(): Note[] | null {
  const [notes, setNotes] = useState<Note[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      voiceNotes.listNotes().then(
        (list) => live && setNotes(list),
        (error: unknown) => console.error('[notes] listing failed', error)
      );
    void load();
    const unsubscribe = voiceNotes.onNotesChanged(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  return notes;
}

/** One Note: undefined while loading, null when there is none with this id. */
export function useNote(id: string): Note | null | undefined {
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = () =>
      voiceNotes.getNote(id).then(
        (n) => live && setNote(n),
        (error: unknown) => console.error('[notes] reading failed', error)
      );
    void load();
    const unsubscribe = voiceNotes.onNotesChanged(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [id]);
  return note;
}

// When this JS process started: Instant Capture runs once per process, never on a return to the app.
const processStartedAt = Date.now();
let launch: Promise<boolean> | null = null;

/**
 * Runs the core's launch the first time it is called in this process; later calls get the same
 * result. Resolves true when it started a Recording (Instant Capture). Called as the app's code loads,
 * so the microphone doesn't wait for the first render. Logs how long after the JS start the
 * microphone was on (target: under 1 s from the icon tap). Read by the device check.
 */
export function launchApp(): Promise<boolean> {
  launch ??= (async () => {
    const [speechModelInstalled, mic] = await Promise.all([
      isSpeechModelInstalled(),
      checkMicPermission(),
    ]);
    // Instant Capture never stops at a permission prompt: without the microphone, launch as a resume.
    const startedRecording = await voiceNotes.launch({
      fresh: mic === 'granted',
      speechModelInstalled,
    });
    if (startedRecording) {
      console.log(
        `[voice-notes] Instant Capture recording ${Date.now() - processStartedAt} ms after JS start`
      );
    }
    return startedRecording;
  })();
  return launch;
}

/** Tells the core when the app goes to the background and comes back, for the life of the process. */
export function followAppState(): void {
  AppState.addEventListener('change', (appState) => {
    if (appState === 'active' || appState === 'background') voiceNotes.appStateChanged(appState);
  });
}

export const startRecording = () => voiceNotes.startRecording();
export const discardRecording = () => voiceNotes.discard();
export const undoDiscard = () => voiceNotes.undoDiscard();
/** Logs how long Stop took, the wait the user sees (target: 1.5 s or less). Read by the device check. */
export async function stopRecording() {
  const stoppedAt = Date.now();
  try {
    return await voiceNotes.stop();
  } finally {
    console.log(`[voice-notes] Stop took ${Date.now() - stoppedAt} ms`);
  }
}
