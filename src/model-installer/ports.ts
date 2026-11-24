/** Ports the model installer depends on. Real adapters: `rnfs-adapters.ts`. Test fakes: `fakes.ts`. */

export interface Http {
  /**
   * Downloads `url` into the file at `path`, replacing it. Calls `onProgress` with the bytes written
   * to `path` so far. Rejects on a network error or a non-2xx status.
   */
  download(url: string, path: string, onProgress: (bytesWritten: number) => void): Promise<void>;
}

export interface FileSystem {
  /** The file's size in bytes, or null when there is no file at `path`. */
  size(path: string): Promise<number | null>;
  /** The file's SHA-256, lowercase hex. */
  sha256(path: string): Promise<string>;
  /** Creates the directory and any missing parents. */
  makeDirectory(path: string): Promise<void>;
  /** Moves a file, replacing whatever is at `to`. */
  move(from: string, to: string): Promise<void>;
  /** Deletes the file if it exists. */
  remove(path: string): Promise<void>;
}
