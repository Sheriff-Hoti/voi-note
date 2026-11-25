import { createVoiceNotes } from '@/voice-notes/core';
import {
  FakeAudioFiles,
  FakeAudioSource,
  FakeClock,
  FakeSpeechEngine,
  NodeSqlExecutor,
} from '@/voice-notes/fakes';

function setup() {
  const audio = new FakeAudioSource();
  const engine = new FakeSpeechEngine();
  const files = new FakeAudioFiles();
  const sql = new NodeSqlExecutor();
  const clock = new FakeClock();
  const core = createVoiceNotes({ audio, engine, files, sql, clock });
  return { audio, engine, files, sql, clock, core };
}

describe('voice-notes core', () => {
  it('Stop transcribes the whole Recording into a ready Note', async () => {
    const { audio, engine, files, clock, core } = setup();
    engine.willTranscribe('Buy milk on the way home.');
    const startedAt = clock.time;

    await core.startRecording();
    audio.speak(10);
    audio.silence(5);
    audio.speak(10);
    clock.time += 2_500;
    const note = await core.stop();

    expect(audio.capturing).toBe(false);
    // This ticket decodes the whole Recording at once: one decode of all 25 frames (2.5 s at 16 kHz).
    expect(engine.received.map((samples) => samples.length)).toEqual([40_000]);
    expect(note).toEqual({
      id: expect.any(String),
      createdAt: startedAt,
      status: 'ready',
      text: 'Buy milk on the way home.',
      audioPath: expect.any(String),
      durationMs: 2_500,
    });
    expect(files.files.get(note.audioPath!)).toHaveLength(40_000);
    expect(await core.getNote(note.id)).toEqual(note);
  });

  /** Records `text` as one Recording of 1 s of speech, starting at `at`. */
  async function record(s: ReturnType<typeof setup>, text: string, at: number) {
    s.clock.time = at;
    s.engine.willTranscribe(text);
    await s.core.startRecording();
    s.audio.speak(10);
    return s.core.stop();
  }

  it('lists the Notes newest first', async () => {
    const s = setup();
    await record(s, 'First thought.', Date.UTC(2026, 10, 25, 9, 0));
    await record(s, 'Third thought.', Date.UTC(2026, 10, 25, 11, 0));
    await record(s, 'Second thought.', Date.UTC(2026, 10, 25, 10, 0));

    expect((await s.core.listNotes()).map((n) => n.text)).toEqual([
      'Third thought.',
      'Second thought.',
      'First thought.',
    ]);
  });

  it('keeps the Notes across an app restart', async () => {
    const s = setup();
    const note = await record(s, 'Call the dentist.', Date.UTC(2026, 10, 25, 9, 0));

    // A relaunch: a new core on the same database.
    const relaunched = createVoiceNotes({
      audio: new FakeAudioSource(),
      engine: new FakeSpeechEngine(),
      files: s.files,
      sql: s.sql,
      clock: s.clock,
    });

    expect(await relaunched.listNotes()).toEqual([note]);
  });

  it('shows the Recording with its elapsed time, then finishing, then idle', async () => {
    const { audio, engine, core } = setup();
    engine.willTranscribe('Hello.');
    const states: unknown[] = [];
    core.subscribe(() => states.push(core.getState()));

    await core.startRecording();
    audio.speak(3);
    const notesChanged = jest.fn();
    core.onNotesChanged(notesChanged);
    await core.stop();

    expect(states).toEqual([
      { kind: 'recording', elapsedMs: 0 },
      { kind: 'recording', elapsedMs: 100 },
      { kind: 'recording', elapsedMs: 200 },
      { kind: 'recording', elapsedMs: 300 },
      { kind: 'finishing' },
      { kind: 'idle' },
    ]);
    expect(notesChanged).toHaveBeenCalled();
  });

  it('can record again after a Stop, and the Speech Model is loaded once', async () => {
    const s = setup();
    await record(s, 'One.', Date.UTC(2026, 10, 25, 9, 0));
    await record(s, 'Two.', Date.UTC(2026, 10, 25, 9, 5));

    expect(s.engine.loads).toBe(1);
    expect(await s.core.listNotes()).toHaveLength(2);
  });

  it('keeps the audio the microphone delivers while it stops', async () => {
    const { audio, engine, core } = setup();
    engine.willTranscribe('Last words.');
    audio.framesDuringStop = 2;
    const states: unknown[] = [];

    await core.startRecording();
    audio.speak(10);
    core.subscribe(() => states.push(core.getState()));
    const note = await core.stop();

    expect(engine.received.map((samples) => samples.length)).toEqual([12 * 1_600]);
    expect(note.durationMs).toBe(1_200);
    expect(states).toEqual([{ kind: 'finishing' }, { kind: 'idle' }]);
  });

  it('keeps no Recording going when the microphone fails to start', async () => {
    const { audio, core } = setup();
    audio.failToStart = new Error('mic busy');

    await expect(core.startRecording()).rejects.toThrow('mic busy');

    expect(core.getState()).toEqual({ kind: 'idle' });
  });

  it('leaves no Note and no audio file behind when the Speech Model fails to load', async () => {
    const { audio, engine, files, core } = setup();
    engine.failToLoad = new Error('model file is corrupt');

    await core.startRecording();
    audio.speak(10);
    await expect(core.stop()).rejects.toThrow('model file is corrupt');

    expect(await core.listNotes()).toEqual([]);
    expect([...files.files.keys()]).toEqual([]);
    expect(core.getState()).toEqual({ kind: 'idle' });
  });
});
