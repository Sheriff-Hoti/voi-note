import {
  ChecksumMismatchError,
  createModelInstaller,
  type DownloadProgress,
} from '@/model-installer/installer';
import { FakeFileSystem, FakeHttp } from '@/model-installer/fakes';

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

function setup() {
  const fs = new FakeFileSystem();
  const http = new FakeHttp(fs);
  http.serve('https://models.test/encoder.onnx', 'hello');
  http.serve('https://models.test/tokens.txt', 'world');
  const installer = createModelInstaller({ model: MODEL, dir: DIR, http, fs });
  return { fs, http, installer };
}

describe('model installer', () => {
  it('installs the Speech Model with a fresh download', async () => {
    const { installer } = setup();
    expect(await installer.status()).toBe('not-installed');

    const progress: DownloadProgress[] = [];
    await installer.download((p) => progress.push(p));

    expect(await installer.status()).toBe('installed');
    expect(progress.at(-1)).toMatchObject({ bytesDone: 10, bytesTotal: 10 });
  });

  it('does not install a file whose checksum does not match', async () => {
    const { http, installer } = setup();
    http.serve('https://models.test/tokens.txt', 'w0rld'); // right size, wrong bytes

    await expect(installer.download()).rejects.toBeInstanceOf(ChecksumMismatchError);

    expect(await installer.status()).toBe('not-installed');
  });

  describe('status at startup', () => {
    it('is installed when every file is present at its pinned size, without rehashing', async () => {
      const { fs, installer } = setup();
      // Right sizes, wrong bytes: only a rehash could tell, and startup does not rehash.
      fs.write(`${DIR}/encoder.onnx`, 'HELLO');
      fs.write(`${DIR}/tokens.txt`, 'WORLD');

      expect(await installer.status()).toBe('installed');
    });

    it('is not installed when a file is missing or has another size', async () => {
      const { fs, installer } = setup();
      fs.write(`${DIR}/encoder.onnx`, 'hello');
      expect(await installer.status()).toBe('not-installed');

      fs.write(`${DIR}/tokens.txt`, 'worl');
      expect(await installer.status()).toBe('not-installed');
    });

    it('stays installed for a new installer after a download (a relaunch)', async () => {
      const { fs, http, installer } = setup();
      await installer.download();

      const relaunched = createModelInstaller({ model: MODEL, dir: DIR, http, fs });
      expect(await relaunched.status()).toBe('installed');
    });
  });
});
