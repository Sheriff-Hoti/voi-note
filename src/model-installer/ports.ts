/** Ports the model installer depends on. Real adapters: `adapters.ts`. Test fakes: `fakes.ts`. */

/** An HTTP response whose headers have arrived and whose body has not been read yet. */
export interface HttpResponse {
  status: number;
  /** The first byte position of the `Content-Range` header, or null when there is none. */
  contentRangeStart: number | null;
  /** The next piece of the body, or null at its end. Rejects on a network error or once aborted. */
  read(): Promise<Uint8Array | null>;
  /** Stops reading the body and releases the connection. */
  cancel(): void;
}

export interface Http {
  /**
   * Sends a GET for `url`, with `Range: bytes=<from>-` when `from` is above 0, and resolves once the
   * response headers arrive, whatever the status. Rejects on a network error or once `signal` aborts.
   */
  get(url: string, options: { from: number; signal: AbortSignal }): Promise<HttpResponse>;
}

export interface FileSystem {
  /** The file's size in bytes, or null when there is no file at `path`. */
  size(path: string): Promise<number | null>;
  /** The file's SHA-256, lowercase hex. */
  sha256(path: string): Promise<string>;
  /** Creates the directory and any missing parents. */
  makeDirectory(path: string): Promise<void>;
  /** Appends bytes to the file, creating it if needed. */
  append(path: string, bytes: Uint8Array): Promise<void>;
  /** Moves a file, replacing whatever is at `to`. */
  move(from: string, to: string): Promise<void>;
  /** Deletes the file if it exists. */
  remove(path: string): Promise<void>;
  /** Free bytes on the storage the model is installed to. */
  freeSpace(): Promise<number>;
}

export interface Network {
  /** True when the active connection is mobile data. */
  isOnMobileData(): Promise<boolean>;
}
