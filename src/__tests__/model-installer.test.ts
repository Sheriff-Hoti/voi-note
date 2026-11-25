import {
  DownloadCancelledError,
  DownloadFailedError,
  MobileDataError,
  ModelVerificationError,
  NotEnoughSpaceError,
  SPACE_HEADROOM_BYTES,
  createModelInstaller,
  type DownloadProgress,
} from '@/model-installer/installer';
import { FakeFileSystem, FakeHttp, FakeNetwork } from '@/model-installer/fakes';

// A tiny two-file Speech Model. Checksums are the known SHA-256 of each body.
const MODEL = {
  files: [
    {
      name: 'encoder.onnx',
      url: 'https://models.test/encoder.onnx',
      size: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', // "hello"
    },
    {
      name: 'tokens.txt',
      url: 'https://models.test/tokens.txt',
      size: 5,
      sha256: '486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7', // "world"
    },
  ],
};
const DIR = '/app/models/test-model';
const ENCODER_URL = 'https://models.test/encoder.onnx';
const TOKENS_URL = 'https://models.test/tokens.txt';

function setup() {
  const fs = new FakeFileSystem();
  const http = new FakeHttp();
  const network = new FakeNetwork();
  http.serve(ENCODER_URL, 'hello');
  http.serve(TOKENS_URL, 'world');
  const installer = createModelInstaller({ model: MODEL, dir: DIR, http, fs, network });
  return { fs, http, network, installer };
}

/** What a download ends with: undefined once installed, or the error it rejected with. */
const outcomeOf = (download: Promise<void>): Promise<unknown> =>
  download.then(
    () => undefined,
    (error: unknown) => error
  );

/** Runs a download to the end on Jest's fake clock, through any backoff and stall timeouts. */
async function finish(download: Promise<void>): Promise<unknown> {
  const outcome = outcomeOf(download);
  await jest.runAllTimersAsync();
  return outcome;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('model installer', () => {
  it('installs the Speech Model with a fresh download', async () => {
    const { installer } = setup();
    expect(await installer.status()).toMatchObject({ kind: 'not-installed' });

    const progress: DownloadProgress[] = [];
    await installer.download({ onProgress: (p) => progress.push(p) });

    expect(await installer.status()).toEqual({ kind: 'installed' });
    expect(progress.at(-1)).toMatchObject({ bytesDone: 10, bytesTotal: 10 });
  });

  it('does not install a file whose checksum does not match', async () => {
    const { http, installer } = setup();
    http.serve(TOKENS_URL, 'w0rld'); // right size, wrong bytes

    await expect(installer.download()).rejects.toBeInstanceOf(ModelVerificationError);

    expect(await installer.status()).toMatchObject({ kind: 'not-installed' });
  });

  describe('after the app was killed mid-download', () => {
    it('reports the bytes already downloaded and resumes from them', async () => {
      const { fs, http, network } = setup();
      // What a killed download leaves: the first 3 bytes of the encoder in its .partial file.
      fs.write(`${DIR}/encoder.onnx.partial`, 'hel');

      const relaunched = createModelInstaller({ model: MODEL, dir: DIR, http, fs, network });
      expect(await relaunched.status()).toEqual({ kind: 'not-installed', bytesDownloaded: 3 });

      const progress: DownloadProgress[] = [];
      await relaunched.download({ onProgress: (p) => progress.push(p) });

      expect(http.requests.filter((r) => r.url === ENCODER_URL)).toEqual([
        expect.objectContaining({ from: 3 }),
      ]);
      expect(progress[0]).toMatchObject({ phase: 'downloading', bytesDone: 3 });
      expect(await relaunched.status()).toEqual({ kind: 'installed' });
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });

    it('skips files that were already verified and moved into place', async () => {
      const { fs, http, installer } = setup();
      fs.write(`${DIR}/encoder.onnx`, 'hello');

      expect(await installer.status()).toEqual({ kind: 'not-installed', bytesDownloaded: 5 });
      await installer.download();

      expect(http.requests.map((r) => r.url)).toEqual([TOKENS_URL]);
      expect(await installer.status()).toEqual({ kind: 'installed' });
    });
  });

  describe('resuming with Range', () => {
    const resumeOfEncoder = () => {
      const s = setup();
      s.fs.write(`${DIR}/encoder.onnx.partial`, 'hel');
      return s;
    };
    const encoderRequests = (http: FakeHttp) =>
      http.requests.filter((r) => r.url === ENCODER_URL).map((r) => r.from);

    it('restarts the file when the 206 starts at another byte than asked for', async () => {
      const { fs, http, installer } = resumeOfEncoder();
      http.script(ENCODER_URL, { badRangeStart: 1 });

      expect(await finish(installer.download())).toBeUndefined();

      expect(encoderRequests(http)).toEqual([3, 0]);
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });

    it('restarts the file on a 416', async () => {
      const { fs, http, installer } = resumeOfEncoder();
      http.script(ENCODER_URL, { status: 416 });

      expect(await finish(installer.download())).toBeUndefined();

      expect(encoderRequests(http)).toEqual([3, 0]);
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });

    it('replaces the partial file when the server ignores Range and sends the whole file', async () => {
      const { fs, http, installer } = resumeOfEncoder();
      http.script(ENCODER_URL, 'ignore-range');

      expect(await finish(installer.download())).toBeUndefined();

      expect(encoderRequests(http)).toEqual([3]);
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });
  });

  describe('network trouble', () => {
    const gaps = (http: FakeHttp) =>
      http.requests.slice(1).map((r, i) => r.at - http.requests[i].at);

    it('backs off 1, 2, then 4 s between failed attempts, then gives up with an error', async () => {
      const { http, installer } = setup();
      http.script(ENCODER_URL, 'offline', 'offline', 'offline', 'offline');

      const error = await finish(installer.download());

      expect(error).toBeInstanceOf(DownloadFailedError);
      expect(gaps(http)).toEqual([1_000, 2_000, 4_000]);
      expect(await installer.status()).toMatchObject({ kind: 'not-installed' });
    });

    it('starts the backoff over after an attempt that made progress, and resumes each time', async () => {
      const { fs, http, installer } = setup();
      http.script(ENCODER_URL, { failAfter: 2 }, { failAfter: 2 }, 'offline');

      expect(await finish(installer.download())).toBeUndefined();

      expect(http.requests.map((r) => r.from)).toEqual([0, 2, 4, 4, 0]);
      expect(gaps(http).slice(0, 3)).toEqual([1_000, 1_000, 2_000]);
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });

    it('drops a download that has stalled for 120 s, then resumes it', async () => {
      const { fs, http, installer } = setup();
      http.script(ENCODER_URL, { stallAfter: 2 });

      expect(await finish(installer.download())).toBeUndefined();

      expect(http.requests.map((r) => r.from)).toEqual([0, 2, 0]);
      expect(gaps(http)[0]).toBe(120_000 + 1_000);
      expect(fs.text(`${DIR}/encoder.onnx`)).toBe('hello');
    });
  });

  describe('before downloading', () => {
    it('refuses to start without enough free space, before any request', async () => {
      const { fs, http, installer } = setup();
      fs.freeBytes = 4;

      const error = await finish(installer.download());

      expect(error).toBeInstanceOf(NotEnoughSpaceError);
      expect(error).toMatchObject({ bytesNeeded: 10 + SPACE_HEADROOM_BYTES, bytesFree: 4 });
      expect(http.requests).toEqual([]);
    });

    it('only needs space for the bytes not downloaded yet', async () => {
      const { fs, installer } = setup();
      fs.write(`${DIR}/encoder.onnx.partial`, 'hel');
      fs.freeBytes = 7 + SPACE_HEADROOM_BYTES;

      expect(await finish(installer.download())).toBeUndefined();
    });

    it('stops on mobile data unless the user chose to continue on it', async () => {
      const { http, network, installer } = setup();
      network.onMobileData = true;

      expect(await finish(installer.download())).toBeInstanceOf(MobileDataError);
      expect(http.requests).toEqual([]);

      expect(await finish(installer.download({ allowMobileData: true }))).toBeUndefined();
      expect(await installer.status()).toEqual({ kind: 'installed' });
    });
  });

  describe('cancel and delete', () => {
    it('cancel stops the download and keeps its bytes for a later resume', async () => {
      const { http, installer } = setup();
      http.script(ENCODER_URL, { stallAfter: 2 });
      const download = outcomeOf(installer.download());
      await jest.advanceTimersByTimeAsync(0);

      installer.cancel();

      expect(await download).toBeInstanceOf(DownloadCancelledError);
      expect(http.requests).toHaveLength(1);
      expect(await installer.status()).toEqual({ kind: 'not-installed', bytesDownloaded: 2 });
    });

    it('cancel also stops a download waiting to retry', async () => {
      const { http, installer } = setup();
      http.script(ENCODER_URL, 'offline');
      const download = outcomeOf(installer.download());
      await jest.advanceTimersByTimeAsync(0);

      installer.cancel();

      expect(await download).toBeInstanceOf(DownloadCancelledError);
      expect(http.requests).toHaveLength(1);
    });

    it('delete removes an installed Speech Model', async () => {
      const { fs, installer } = setup();
      await finish(installer.download());

      await installer.delete();

      expect(await installer.status()).toEqual({ kind: 'not-installed', bytesDownloaded: 0 });
      expect([...fs.files.keys()]).toEqual([]);
    });

    it('delete during a download stops it and removes what it downloaded', async () => {
      const { fs, http, installer } = setup();
      http.script(TOKENS_URL, { stallAfter: 2 });
      const download = outcomeOf(installer.download());
      await jest.advanceTimersByTimeAsync(0);

      await installer.delete();

      expect(await download).toBeInstanceOf(DownloadCancelledError);
      expect([...fs.files.keys()]).toEqual([]);
    });
  });

  describe('status at startup', () => {
    it('is installed when every file is present at its pinned size, without rehashing', async () => {
      const { fs, installer } = setup();
      // Right sizes, wrong bytes: only a rehash could tell, and startup does not rehash.
      fs.write(`${DIR}/encoder.onnx`, 'HELLO');
      fs.write(`${DIR}/tokens.txt`, 'WORLD');

      expect(await installer.status()).toEqual({ kind: 'installed' });
    });

    it('is not installed when a file is missing or has another size', async () => {
      const { fs, installer } = setup();
      fs.write(`${DIR}/encoder.onnx`, 'hello');
      expect(await installer.status()).toMatchObject({ kind: 'not-installed' });

      fs.write(`${DIR}/tokens.txt`, 'worl');
      expect(await installer.status()).toMatchObject({ kind: 'not-installed' });
    });

    it('stays installed for a new installer after a download (a relaunch)', async () => {
      const { fs, http, network, installer } = setup();
      await installer.download();

      const relaunched = createModelInstaller({ model: MODEL, dir: DIR, http, fs, network });
      expect(await relaunched.status()).toEqual({ kind: 'installed' });
    });
  });
});
