import type { FileSystem, Http } from './ports';

/** One file of a Speech Model, pinned by size and SHA-256. */
export type ModelFile = { name: string; url: string; size: number; sha256: string };
export type SpeechModelFiles = { files: readonly ModelFile[] };

export type ModelStatus = 'not-installed' | 'installed';
export type DownloadProgress = {
  /** "verifying" while a finished file is being checked against its pinned size and SHA-256. */
  phase: 'downloading' | 'verifying';
  bytesDone: number;
  bytesTotal: number;
};

/** A downloaded file did not match its pinned size or SHA-256. It was deleted, not installed. */
export class ChecksumMismatchError extends Error {
  constructor(readonly fileName: string) {
    super(`${fileName} does not match its pinned size and SHA-256`);
    this.name = 'ChecksumMismatchError';
  }
}

export interface ModelInstaller {
  /** "installed" when every file is present at its exact pinned size. Does not rehash. */
  status(): Promise<ModelStatus>;
  /**
   * Downloads each file to `<name>.partial`, verifies it, then moves it into place, so a file under
   * its final name is always a verified one. Resolves once the Speech Model is installed; rejects with
   * ChecksumMismatchError when a file fails verification.
   */
  download(onProgress?: (progress: DownloadProgress) => void): Promise<void>;
}

export function createModelInstaller(deps: {
  model: SpeechModelFiles;
  /** Directory the model's files are installed into. */
  dir: string;
  http: Http;
  fs: FileSystem;
}): ModelInstaller {
  const { model, dir, http, fs } = deps;
  const pathOf = (file: ModelFile) => `${dir}/${file.name}`;
  const bytesTotal = model.files.reduce((sum, f) => sum + f.size, 0);

  return {
    async status() {
      for (const file of model.files) {
        if ((await fs.size(pathOf(file))) !== file.size) return 'not-installed';
      }
      return 'installed';
    },

    async download(onProgress) {
      await fs.makeDirectory(dir);
      let bytesBefore = 0;
      for (const file of model.files) {
        const path = pathOf(file);
        const partial = `${path}.partial`;
        await http.download(file.url, partial, (written) =>
          onProgress?.({ phase: 'downloading', bytesDone: bytesBefore + written, bytesTotal })
        );
        bytesBefore += file.size;
        onProgress?.({ phase: 'verifying', bytesDone: bytesBefore, bytesTotal });
        const verified =
          (await fs.size(partial)) === file.size && (await fs.sha256(partial)) === file.sha256;
        if (!verified) {
          await fs.remove(partial);
          throw new ChecksumMismatchError(file.name);
        }
        await fs.move(partial, path);
      }
    },
  };
}
