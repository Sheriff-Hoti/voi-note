import { createHash } from 'node:crypto';

import type { FileSystem, Http, HttpResponse, Network } from './ports';

/** An in-memory file system with as much free space as `freeBytes` says. */
export class FakeFileSystem implements FileSystem {
  readonly files = new Map<string, Uint8Array>();
  freeBytes = Number.MAX_SAFE_INTEGER;

  write(path: string, content: Uint8Array | string): void {
    this.files.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  text(path: string): string | undefined {
    const content = this.files.get(path);
    return content && new TextDecoder().decode(content);
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

  async append(path: string, bytes: Uint8Array) {
    const before = this.files.get(path) ?? new Uint8Array();
    const after = new Uint8Array(before.length + bytes.length);
    after.set(before);
    after.set(bytes, before.length);
    this.files.set(path, after);
  }

  async move(from: string, to: string) {
    const content = this.files.get(from);
    if (!content) throw new Error(`no such file: ${from}`);
    this.files.delete(from);
    this.files.set(to, content);
  }

  async remove(path: string) {
    this.files.delete(path);
  }

  async freeSpace() {
    return this.freeBytes;
  }
}

/**
 * How the fake server answers one request. Without a scripted reply it serves the body, honouring
 * `Range` with a 206.
 */
export type FakeReply =
  /** The request fails before any response. */
  | 'offline'
  /** A 200 with the whole body, ignoring `Range`. */
  | 'ignore-range'
  | { status: number }
  /** A 206 whose `Content-Range` starts at `start` (and whose body really starts there). */
  | { badRangeStart: number }
  /** The connection drops after this many body bytes. */
  | { failAfter: number }
  /** The body stops arriving after this many bytes, until the request is aborted. */
  | { stallAfter: number };

export type FakeRequest = { url: string; from: number; at: number };

/** Serves fixed bodies by URL, two bytes per read, and records every request. */
export class FakeHttp implements Http {
  readonly requests: FakeRequest[] = [];
  private readonly bodies = new Map<string, Uint8Array>();
  private readonly scripts = new Map<string, FakeReply[]>();

  serve(url: string, body: string): void {
    this.bodies.set(url, new TextEncoder().encode(body));
  }

  /** The next requests for `url` get these replies, in order; later ones are served normally. */
  script(url: string, ...replies: FakeReply[]): void {
    this.scripts.set(url, [...(this.scripts.get(url) ?? []), ...replies]);
  }

  async get(url: string, { from, signal }: { from: number; signal: AbortSignal }) {
    this.requests.push({ url, from, at: Date.now() });
    if (signal.aborted) throw abortError();
    const body = this.bodies.get(url);
    const reply = this.scripts.get(url)?.shift();
    if (reply === 'offline') throw new TypeError('Network request failed');
    if (!body) return response(404, null, new Uint8Array(), signal);
    if (reply === 'ignore-range') return response(200, null, body, signal);
    if (reply && 'status' in reply) return response(reply.status, null, new Uint8Array(), signal);
    if (reply && 'badRangeStart' in reply) {
      return response(206, reply.badRangeStart, body.slice(reply.badRangeStart), signal);
    }
    const sent = from > 0 ? body.slice(from) : body;
    const status = from > 0 ? 206 : 200;
    const contentRangeStart = from > 0 ? from : null;
    if (reply && 'failAfter' in reply) {
      return response(status, contentRangeStart, sent, signal, { failAfter: reply.failAfter });
    }
    if (reply && 'stallAfter' in reply) {
      return response(status, contentRangeStart, sent, signal, { stallAfter: reply.stallAfter });
    }
    return response(status, contentRangeStart, sent, signal);
  }
}

export class FakeNetwork implements Network {
  onMobileData = false;

  async isOnMobileData() {
    return this.onMobileData;
  }
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function response(
  status: number,
  contentRangeStart: number | null,
  body: Uint8Array,
  signal: AbortSignal,
  trouble: { failAfter?: number; stallAfter?: number } = {}
): HttpResponse {
  let offset = 0;
  let cancelled = false;
  return {
    status,
    contentRangeStart,
    cancel: () => {
      cancelled = true;
    },
    read: () => {
      if (signal.aborted || cancelled) return Promise.reject(abortError());
      if (trouble.failAfter !== undefined && offset >= trouble.failAfter) {
        return Promise.reject(new TypeError('Network connection lost'));
      }
      if (trouble.stallAfter !== undefined && offset >= trouble.stallAfter) {
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        );
      }
      if (offset >= body.length) return Promise.resolve(null);
      const limit = trouble.failAfter ?? trouble.stallAfter ?? body.length;
      const chunk = body.slice(offset, Math.min(offset + 2, limit, body.length));
      offset += chunk.length;
      return Promise.resolve(chunk);
    },
  };
}
