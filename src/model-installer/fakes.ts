import { createHash } from 'node:crypto';

import type { FileSystem, Http } from './ports';

/** An in-memory file system. */
export class FakeFileSystem implements FileSystem {
  readonly files = new Map<string, Uint8Array>();

  write(path: string, content: Uint8Array | string): void {
    this.files.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  async size(path: string) {
    return this.files.get(path)?.length ?? null;
  }

  async sha256(path: string) {
    const content = this.files.get(path);
    if (!content) throw new Error(`no such file: ${path}`);
    return createHash('sha256').update(content).digest('hex');
  }

  async makeDirectory() {}

  async move(from: string, to: string) {
    const content = this.files.get(from);
    if (!content) throw new Error(`no such file: ${from}`);
    this.files.delete(from);
    this.files.set(to, content);
  }

  async remove(path: string) {
    this.files.delete(path);
  }
}

/** Serves fixed bodies by URL into a FakeFileSystem, reporting progress in a few steps. */
export class FakeHttp implements Http {
  private readonly bodies = new Map<string, Uint8Array>();

  constructor(private readonly fs: FakeFileSystem) {}

  serve(url: string, body: string): void {
    this.bodies.set(url, new TextEncoder().encode(body));
  }

  async download(url: string, path: string, onProgress: (bytesWritten: number) => void) {
    const body = this.bodies.get(url);
    if (!body) throw new Error(`404 ${url}`);
    const step = Math.max(1, Math.ceil(body.length / 4));
    for (let end = step; end < body.length; end += step) {
      this.fs.write(path, body.slice(0, end));
      onProgress(end);
    }
    this.fs.write(path, body);
    onProgress(body.length);
  }
}
