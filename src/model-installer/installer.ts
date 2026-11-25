import type { FileSystem, Http, Network } from './ports';

/** One file of a Speech Model, pinned by size and SHA-256. */
export type ModelFile = { name: string; url: string; size: number; sha256: string };
export type SpeechModelFiles = { files: readonly ModelFile[] };

export type ModelStatus =
  | { kind: 'installed' }
  /** `bytesDownloaded`: what is already on disk from an earlier, interrupted download, and is not fetched again. */
  | { kind: 'not-installed'; bytesDownloaded: number };

export type DownloadProgress = {
  /** "verifying" while a finished file is being checked against its pinned size and SHA-256. */
  phase: 'downloading' | 'verifying';
  bytesDone: number;
  bytesTotal: number;
};

export type DownloadOptions = {
  onProgress?: (progress: DownloadProgress) => void;
  /** The user saw the mobile-data warning and chose to download anyway. */
  allowMobileData?: boolean;
};

/** An attempt that receives no bytes for this long is dropped and retried. */
export const STALL_TIMEOUT_MS = 120_000;
/** Waits between failed attempts: 1, 2, then 4 s. One more failure without progress gives up. */
export const BACKOFF_MS = [1_000, 2_000, 4_000] as const;
/** Kept free on top of the download itself, so installing the Speech Model does not fill the phone. */
export const SPACE_HEADROOM_BYTES = 50_000_000;

/** A downloaded file did not match its pinned size or SHA-256. It was deleted, not installed. */
export class ModelVerificationError extends Error {
  constructor(fileName: string) {
    super(`${fileName} does not match its pinned size and SHA-256`);
    this.name = 'ModelVerificationError';
  }
}

/** There is not enough free space for the rest of the download. Nothing was downloaded. */
export class NotEnoughSpaceError extends Error {
  constructor(
    readonly bytesNeeded: number,
    readonly bytesFree: number
  ) {
    super(`Not enough free space: needs ${mb(bytesNeeded)} MB, ${mb(bytesFree)} MB free`);
    this.name = 'NotEnoughSpaceError';
  }
}

/** The phone is on mobile data and the user has not chosen to download on it. Nothing was downloaded. */
export class MobileDataError extends Error {
  constructor() {
    super('On mobile data');
    this.name = 'MobileDataError';
  }
}

/**
 * The download gave up after BACKOFF_MS.length + 1 failed attempts in a row without progress. The bytes
 * downloaded so far are kept, so a retry resumes.
 */
export class DownloadFailedError extends Error {
  constructor(cause: unknown) {
    super(`Network error: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'DownloadFailedError';
  }
}

/** cancel() or delete() stopped the download. */
export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

class StallError extends Error {
  constructor() {
    super(`no data for ${STALL_TIMEOUT_MS / 1000} s`);
    this.name = 'StallError';
  }
}

const mb = (bytes: number) => Math.round(bytes / 1e6).toLocaleString('en-US');

export const totalBytes = (model: SpeechModelFiles) =>
  model.files.reduce((sum, file) => sum + file.size, 0);

export interface ModelInstaller {
  /** Installed when every file is present at its exact pinned size. Does not rehash. */
  status(): Promise<ModelStatus>;
  /**
   * Downloads each file to `<name>.partial`, verifies it, then moves it into place, so a file under its
   * final name is always a verified one. A `.partial` left by an earlier download (even one the app was
   * killed during) is resumed with `Range`, and files already in place are skipped.
   *
   * Before any request it checks free space (NotEnoughSpaceError) and mobile data (MobileDataError,
   * unless `allowMobileData`). Failed attempts are retried with backoff (DownloadFailedError once it
   * gives up). Rejects with ModelVerificationError when a file fails verification, and with
   * DownloadCancelledError after cancel() or delete().
   */
  download(options?: DownloadOptions): Promise<void>;
  /** Stops a running download. Its bytes stay on disk, so the next download resumes. */
  cancel(): void;
  /** Stops a running download, then removes every file of the Speech Model, installed or partial. */
  delete(): Promise<void>;
}

export function createModelInstaller(deps: {
  model: SpeechModelFiles;
  /** Directory the model's files are installed into. */
  dir: string;
  http: Http;
  fs: FileSystem;
  network: Network;
}): ModelInstaller {
  const { model, dir, http, fs, network } = deps;
  const pathOf = (file: ModelFile) => `${dir}/${file.name}`;
  const partialOf = (file: ModelFile) => `${pathOf(file)}.partial`;
  const bytesTotal = totalBytes(model);
  let running: { controller: AbortController; done: Promise<void> } | null = null;

  /** How much of `file` is on disk, and whether that is the verified file in its final place. */
  async function onDisk(file: ModelFile): Promise<{ installed: boolean; bytes: number }> {
    if ((await fs.size(pathOf(file))) === file.size) return { installed: true, bytes: file.size };
    const partial = (await fs.size(partialOf(file))) ?? 0;
    return { installed: false, bytes: Math.min(partial, file.size) };
  }

  async function install(
    signal: AbortSignal,
    { onProgress, allowMobileData = false }: DownloadOptions
  ) {
    await fs.makeDirectory(dir);
    const files = await Promise.all(model.files.map(onDisk));
    const bytesMissing = bytesTotal - files.reduce((sum, f) => sum + f.bytes, 0);
    if (bytesMissing > 0) {
      const bytesFree = await fs.freeSpace();
      const bytesNeeded = bytesMissing + SPACE_HEADROOM_BYTES;
      if (bytesFree < bytesNeeded) throw new NotEnoughSpaceError(bytesNeeded, bytesFree);
      if (!allowMobileData && (await network.isOnMobileData())) throw new MobileDataError();
    }

    let bytesBefore = 0;
    for (const [i, file] of model.files.entries()) {
      if (!files[i].installed) {
        const partial = partialOf(file);
        await fetchFile(file, signal, (have) =>
          onProgress?.({ phase: 'downloading', bytesDone: bytesBefore + have, bytesTotal })
        );
        onProgress?.({ phase: 'verifying', bytesDone: bytesBefore + file.size, bytesTotal });
        const verified =
          (await fs.size(partial)) === file.size && (await fs.sha256(partial)) === file.sha256;
        if (!verified) {
          await fs.remove(partial);
          throw new ModelVerificationError(file.name);
        }
        if (signal.aborted) throw new DownloadCancelledError();
        await fs.move(partial, pathOf(file));
      }
      bytesBefore += file.size;
    }
  }

  /** Downloads `file` into its `.partial`, resuming from what is there, retrying failed attempts. */
  async function fetchFile(file: ModelFile, signal: AbortSignal, report: (have: number) => void) {
    const partial = partialOf(file);
    // Failed attempts in a row that added no bytes. An attempt that made progress starts it over.
    let failures = 0;
    for (;;) {
      const before = (await fs.size(partial)) ?? 0;
      try {
        await attempt(file, signal, report);
        return;
      } catch (error) {
        if (signal.aborted) throw new DownloadCancelledError();
        const after = (await fs.size(partial)) ?? 0;
        failures = after > before ? 1 : failures + 1;
        if (failures > BACKOFF_MS.length) throw new DownloadFailedError(error);
        await sleep(BACKOFF_MS[failures - 1], signal);
      }
    }
  }

  /**
   * One request for the rest of `file`. Resolves once its `.partial` holds the whole file. Rejects when
   * the request fails, when no bytes arrive for STALL_TIMEOUT_MS, or when `signal` aborts.
   */
  async function attempt(file: ModelFile, signal: AbortSignal, report: (have: number) => void) {
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal.addEventListener('abort', abort);
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => request.abort(new StallError()), STALL_TIMEOUT_MS);
    };
    try {
      armStallTimer();
      await receive(file, request.signal, armStallTimer, report);
    } catch (error) {
      throw request.signal.reason instanceof StallError ? request.signal.reason : error;
    } finally {
      clearTimeout(stallTimer);
      signal.removeEventListener('abort', abort);
    }
  }

  async function receive(
    file: ModelFile,
    signal: AbortSignal,
    onBytes: () => void,
    report: (have: number) => void
  ) {
    const partial = partialOf(file);
    let have = (await fs.size(partial)) ?? 0;
    if (have > file.size) {
      await fs.remove(partial);
      have = 0;
    }
    report(have);
    if (have === file.size) return;

    const response = await http.get(file.url, { from: have, signal });
    if (
      response.status === 416 ||
      (response.status === 206 && response.contentRangeStart !== have)
    ) {
      // The bytes on disk can't be continued from: start this file over.
      response.cancel();
      await fs.remove(partial);
      throw new Error(`HTTP ${response.status} for a resume from byte ${have}`);
    }
    if (response.status === 200 && have > 0) {
      // The server ignored Range: the body is the whole file.
      await fs.remove(partial);
      have = 0;
      report(have);
    } else if (response.status !== 200 && response.status !== 206) {
      response.cancel();
      throw new Error(`HTTP ${response.status}`);
    }

    for (let chunk = await response.read(); chunk; chunk = await response.read()) {
      await fs.append(partial, chunk);
      have += chunk.length;
      onBytes();
      report(have);
    }
    if (have !== file.size)
      throw new Error(`the connection closed at byte ${have} of ${file.size}`);
  }

  return {
    async status() {
      const files = await Promise.all(model.files.map(onDisk));
      if (files.every((f) => f.installed)) return { kind: 'installed' };
      return { kind: 'not-installed', bytesDownloaded: files.reduce((sum, f) => sum + f.bytes, 0) };
    },

    download(options = {}) {
      if (running) return Promise.reject(new Error('The Speech Model is already downloading'));
      const controller = new AbortController();
      const done = install(controller.signal, options).finally(() => {
        if (running?.controller === controller) running = null;
      });
      running = { controller, done };
      return done;
    },

    cancel() {
      running?.controller.abort();
    },

    async delete() {
      if (running) {
        const { controller, done } = running;
        controller.abort();
        await done.catch(() => {});
      }
      for (const file of model.files) {
        await fs.remove(pathOf(file));
        await fs.remove(partialOf(file));
      }
    },
  };
}

/** Resolves after `ms`, or rejects with DownloadCancelledError once `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DownloadCancelledError());
    const cancelled = () => {
      clearTimeout(timer);
      reject(new DownloadCancelledError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancelled);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancelled, { once: true });
  });
}
