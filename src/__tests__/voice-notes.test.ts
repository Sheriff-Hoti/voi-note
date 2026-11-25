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

/** Lets the decodes the core started finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const FRAME = 1_600;

describe('voice-notes core', () => {
  describe('chunked transcription while recording', () => {
    it('shows the text so far after a pause, and Stop decodes only the audio after it', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Buy milk.', 'Then call mum.');

      await core.startRecording();
      audio.speak(10);
      audio.silence(6); // 0.6 s of pause: a cut
      await settle();

      expect(core.getState()).toEqual({
        kind: 'recording',
        elapsedMs: 1_600,
        textSoFar: 'Buy milk.',
      });

      audio.speak(10);
      const note = await core.stop();

      // The chunk ends after the pause that cut it; Stop decodes only the last 10 frames.
      expect(engine.received.map((s) => s.length / FRAME)).toEqual([16, 10]);
      expect(note?.text).toBe('Buy milk. Then call mum.');
      expect(note?.durationMs).toBe(2_600);
    });

    it('cuts 12 s of speech without a pause at 12 s', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('First part.', 'Second part.');

      await core.startRecording();
      audio.speak(150);
      await core.stop();

      expect(engine.received.map((s) => s.length / FRAME)).toEqual([120, 30]);
    });

    it('places the hard cut at the quietest 100 ms of the last few seconds', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('First part.', 'Second part.');

      await core.startRecording();
      audio.speak(100);
      audio.silence(1); // a breath at 10 s
      audio.speak(49);
      await core.stop();

      expect(engine.received.map((s) => s.length / FRAME)).toEqual([101, 49]);
    });

    it('decodes the chunks cut while the Speech Model loads once it is ready, in order', async () => {
      const { audio, engine, core } = setup();
      const loaded = engine.holdLoad();
      engine.willTranscribe('One.', 'Two.', 'Three.');

      await core.startRecording();
      audio.speak(10);
      audio.silence(6);
      audio.speak(10);
      audio.silence(6);
      await settle();
      expect(core.getState()).toMatchObject({ textSoFar: '' });

      loaded();
      await settle();
      expect(core.getState()).toMatchObject({ textSoFar: 'One. Two.' });

      audio.speak(10);
      expect((await core.stop())?.text).toBe('One. Two. Three.');
    });

    it('joins a hard cut as one sentence: no stray period, no capital', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe(
        'So tomorrow I.',
        'Will call the bank and then.',
        'I pick up the kids.'
      );

      await core.startRecording();
      audio.speak(250); // two hard cuts, no pause
      const note = await core.stop();

      expect(note?.text).toBe('So tomorrow I will call the bank and then I pick up the kids.');
    });

    it('keeps a question or exclamation the model heard at a hard cut', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Did I lock the door?', 'Probably.');

      await core.startRecording();
      audio.speak(150);
      const note = await core.stop();

      expect(note?.text).toBe('Did I lock the door? Probably.');
    });

    it('continues a sentence the model left unfinished at a pause', async () => {
      const { audio, engine, core } = setup();
      // As on the phone: at a short pause the model often ends a chunk without punctuation.
      engine.willTranscribe('It seems', 'Like it works.');

      await core.startRecording();
      audio.speak(10);
      audio.silence(6);
      audio.speak(10);
      const note = await core.stop();

      expect(note?.text).toBe('It seems like it works.');
    });

    it('keeps the punctuation of a cut at a pause', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Buy bread.', 'Water the plants.');

      await core.startRecording();
      audio.speak(10);
      audio.silence(8);
      audio.speak(10);
      const note = await core.stop();

      expect(note?.text).toBe('Buy bread. Water the plants.');
    });

    it('skips silent stretches: the Speech Model never hears them', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Remember the keys.');

      await core.startRecording();
      audio.silence(30);
      audio.speak(10);
      audio.silence(40);
      const note = await core.stop();

      // Only the speech and the pause that ended it are decoded (the pause holds up to 0.5 s of the silence before it).
      expect(engine.received).toHaveLength(1);
      expect(engine.received[0].length / FRAME).toBeLessThanOrEqual(5 + 10 + 6);
      expect(engine.received[0].length / FRAME).toBeGreaterThanOrEqual(10 + 6);
      expect(note?.text).toBe('Remember the keys.');
    });

    it('creates no Note and keeps no audio when nothing was said', async () => {
      const { audio, engine, files, core } = setup();
      const notesChanged = jest.fn();
      core.onNotesChanged(notesChanged);

      await core.startRecording();
      audio.silence(50);
      expect(await core.stop()).toBeNull();

      expect(engine.received).toEqual([]);
      expect(await core.listNotes()).toEqual([]);
      expect([...files.files.keys()]).toEqual([]);
      expect(notesChanged).not.toHaveBeenCalled();
      expect(core.getState()).toEqual({ kind: 'idle' });
    });

    it('creates no Note when the Speech Model hears no words', async () => {
      const { audio, engine, files, core } = setup();
      engine.willTranscribe('  ');

      await core.startRecording();
      audio.speak(10);

      expect(await core.stop()).toBeNull();
      expect(await core.listNotes()).toEqual([]);
      expect([...files.files.keys()]).toEqual([]);
    });
  });

  it('Stop transcribes the whole Recording into a ready Note', async () => {
    const { audio, engine, files, clock, core } = setup();
    engine.willTranscribe('Buy milk on the way home.');
    const startedAt = clock.time;

    await core.startRecording();
    audio.speak(10);
    audio.silence(5);
    audio.speak(10);
    clock.time += 2_500;
    const note = (await core.stop())!;

    expect(audio.capturing).toBe(false);
    // A 0.5 s pause is too short to cut at: one decode of all 25 frames (2.5 s at 16 kHz).
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
      { kind: 'recording', elapsedMs: 0, textSoFar: '' },
      { kind: 'recording', elapsedMs: 100, textSoFar: '' },
      { kind: 'recording', elapsedMs: 200, textSoFar: '' },
      { kind: 'recording', elapsedMs: 300, textSoFar: '' },
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
    const note = (await core.stop())!;

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

  describe('Instant Capture', () => {
    it('starts a Recording on a fresh launch with the Speech Model installed', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Call the plumber.');

      await core.launch({ fresh: true, speechModelInstalled: true });

      expect(audio.capturing).toBe(true);
      expect(core.getState()).toMatchObject({ kind: 'recording' });
      audio.speak(10);
      expect((await core.stop())?.text).toBe('Call the plumber.');
    });

    it('keeps what is said while the Speech Model loads: the microphone starts first', async () => {
      const { audio, engine, core } = setup();
      const loaded = engine.holdLoad();
      engine.willTranscribe('Pick up the parcel.', 'Before six.');

      // Resolves with the Speech Model still loading (about 6 s on the phone).
      await core.launch({ fresh: true, speechModelInstalled: true });
      expect(audio.capturing).toBe(true);
      audio.speak(10);
      audio.silence(6);
      audio.speak(10);

      loaded();
      const note = await core.stop();

      expect(engine.received.map((s) => s.length / FRAME)).toEqual([16, 10]);
      expect(note?.text).toBe('Pick up the parcel. Before six.');
    });

    it('does not record when the app comes back from the background', async () => {
      const { audio, core } = setup();
      await core.launch({ fresh: true, speechModelInstalled: true });
      await core.stop();

      core.appStateChanged('background');
      core.appStateChanged('active');

      expect(audio.capturing).toBe(false);
      expect(core.getState()).toEqual({ kind: 'idle' });
    });

    it('does not record on a launch that is not fresh', async () => {
      const { audio, core } = setup();

      await core.launch({ fresh: false, speechModelInstalled: true });

      expect(audio.capturing).toBe(false);
      expect(core.getState()).toEqual({ kind: 'idle' });
    });

    it('does not record, nor load the Speech Model, when none is installed', async () => {
      const { audio, engine, core } = setup();

      await core.launch({ fresh: true, speechModelInstalled: false });
      await settle();

      expect(audio.capturing).toBe(false);
      expect(engine.loads).toBe(0);
      expect(core.getState()).toEqual({ kind: 'idle' });
    });
  });

  describe('releasing the Speech Model in the background', () => {
    it('releases it as soon as the app goes to the background, and loads it again on return', async () => {
      const { engine, core } = setup();
      await core.launch({ fresh: false, speechModelInstalled: true });
      await settle();
      expect(engine.loaded).toBe(true);

      core.appStateChanged('background');
      await settle();
      expect(engine.loaded).toBe(false);

      core.appStateChanged('active');
      await settle();
      expect(engine.loaded).toBe(true);
      expect(engine.loads).toBe(2);
    });

    it('keeps it through a Recording that runs in the background, and releases it at Stop', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Long thought.');
      await core.launch({ fresh: true, speechModelInstalled: true });

      core.appStateChanged('background');
      audio.speak(10);
      await settle();
      expect(engine.loaded).toBe(true);

      expect((await core.stop())?.text).toBe('Long thought.');
      await settle();
      expect(engine.loaded).toBe(false);
    });

    it('transcribes the next Recording after a release', async () => {
      const { audio, engine, core } = setup();
      await core.launch({ fresh: false, speechModelInstalled: true });
      core.appStateChanged('background');
      await settle();

      engine.willTranscribe('Still works.');
      await core.startRecording();
      audio.speak(10);

      expect((await core.stop())?.text).toBe('Still works.');
    });
  });

  describe('Discard and Undo', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
    afterEach(() => jest.useRealTimers());

    it('Discard makes no Note, and deletes the audio once the 5 s Undo window passes', async () => {
      const { audio, engine, files, core } = setup();
      engine.willTranscribe('Never mind.');
      const notesChanged = jest.fn();
      core.onNotesChanged(notesChanged);

      await core.startRecording();
      audio.speak(10);
      await core.discard();

      expect(audio.capturing).toBe(false);
      expect(core.getState()).toEqual({ kind: 'discarded' });
      expect(files.files.size).toBe(1); // held for Undo

      jest.advanceTimersByTime(4_999);
      await settle();
      expect(files.files.size).toBe(1);

      jest.advanceTimersByTime(1);
      await settle();
      expect(core.getState()).toEqual({ kind: 'idle' });
      expect([...files.files.keys()]).toEqual([]);
      expect(await core.listNotes()).toEqual([]);
      expect(notesChanged).not.toHaveBeenCalled();
    });

    it('Undo inside the window makes the Note, as if Stop had been tapped', async () => {
      const { audio, engine, files, clock, core } = setup();
      engine.willTranscribe('Keep this after all.');
      const startedAt = clock.time;

      await core.startRecording();
      audio.speak(10);
      await core.discard();
      jest.advanceTimersByTime(4_000);
      const note = (await core.undoDiscard())!;

      expect(note).toEqual({
        id: expect.any(String),
        createdAt: startedAt,
        status: 'ready',
        text: 'Keep this after all.',
        audioPath: expect.any(String),
        durationMs: 1_000,
      });
      expect(await core.listNotes()).toEqual([note]);
      expect(core.getState()).toEqual({ kind: 'idle' });

      // The window's end no longer deletes anything: the audio is the Note's.
      jest.advanceTimersByTime(10_000);
      await settle();
      expect([...files.files.keys()]).toEqual([note.audioPath]);
    });

    it('Undo after the window makes no Note', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Too late.');

      await core.startRecording();
      audio.speak(10);
      await core.discard();
      jest.advanceTimersByTime(5_000);

      await expect(core.undoDiscard()).rejects.toThrow();
      expect(await core.listNotes()).toEqual([]);
    });

    it('a new Recording during the window ends it: the Discarded audio is deleted', async () => {
      const { audio, engine, files, core } = setup();
      await core.startRecording();
      audio.speak(10);
      await core.discard();
      engine.willTranscribe('The real one.');
      await core.startRecording();
      await settle();

      expect([...files.files.keys()]).toEqual([]);
      await expect(core.undoDiscard()).rejects.toThrow();
      audio.speak(10);
      expect((await core.stop())?.text).toBe('The real one.');
    });
  });

  describe('Discard and the background', () => {
    it('going to the background ends the Undo window: the audio is deleted and the Speech Model released', async () => {
      const { audio, engine, files, core } = setup();
      await core.startRecording();
      audio.speak(10);
      await core.discard();
      await settle();
      expect(engine.loaded).toBe(true);

      core.appStateChanged('background');
      await settle();

      expect([...files.files.keys()]).toEqual([]);
      expect(core.getState()).toEqual({ kind: 'idle' });
      expect(engine.loaded).toBe(false);
      await expect(core.undoDiscard()).rejects.toThrow();
    });
  });

  describe('one decode at a time', () => {
    it('keeps the Speech Model while a Note is saved in the background, and releases it after', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Saved in the background.');
      await core.startRecording();
      audio.speak(10);
      const decoded = engine.holdTranscribe();

      const stopped = core.stop();
      await settle(); // the last decode is running
      core.appStateChanged('background');
      decoded();

      expect((await stopped)?.text).toBe('Saved in the background.');
      await settle();
      expect(engine.loaded).toBe(false);
    });

    it('decodes a new Recording after the Discarded one has finished its decode', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Thrown away.', 'The real one.');
      await core.startRecording();
      await settle(); // the Speech Model is loaded
      const decoded = engine.holdTranscribe();
      audio.speak(10);
      audio.silence(6); // a cut: its decode is held
      await settle();
      await core.discard();

      await core.startRecording();
      audio.speak(10);
      audio.silence(6);
      await settle();
      decoded();

      expect((await core.stop())?.text).toBe('The real one.');
    });
  });

  describe('the 5-minute cap', () => {
    it('stops the Recording by itself at 5:00 and saves it as Stop does', async () => {
      const { audio, engine, core } = setup();
      engine.willTranscribe('Five minutes of thought.');

      await core.startRecording();
      audio.speak(2_999); // 4:59.9
      expect(audio.capturing).toBe(true);
      expect(core.getState()).toMatchObject({ kind: 'recording' });

      audio.speak(1);
      expect(core.getState()).toEqual({ kind: 'finishing' });

      // The screen, seeing it finish, asks Stop for the Note and gets the cap's.
      const note = (await core.stop())!;
      expect(audio.capturing).toBe(false);
      expect(note.text).toBe('Five minutes of thought.');
      expect(note.durationMs).toBe(300_000);
      expect(await core.listNotes()).toEqual([note]);
      expect(core.getState()).toEqual({ kind: 'idle' });
    });
  });
});
