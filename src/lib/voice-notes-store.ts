import { useEffect, useState, useSyncExternalStore } from 'react';

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

export const startRecording = () => voiceNotes.startRecording();
/** Logs how long Stop took, the wait the user sees (target: 1.5 s or less). Read by the device check. */
export async function stopRecording() {
  const stoppedAt = Date.now();
  try {
    return await voiceNotes.stop();
  } finally {
    console.log(`[voice-notes] Stop took ${Date.now() - stoppedAt} ms`);
  }
}
