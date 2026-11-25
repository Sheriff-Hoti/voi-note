import * as RNFS from '@dr.pogodin/react-native-fs';
import { fetch } from 'expo/fetch';
import { NetworkStateType, getNetworkStateAsync } from 'expo-network';

import type { FileSystem, Http, HttpResponse, Network } from './ports';

/**
 * Body pieces from the network are small. They are merged up to this size before being handed on, so
 * the file is appended to in a few hundred native calls instead of tens of thousands. Small enough
 * that a slow but live connection still delivers one well inside the stall timeout.
 */
const READ_BYTES = 256 * 1024;

/**
 * HTTP on `expo/fetch`, which streams the body. The native downloaders can't be used here: they
 * either overwrite the file or append before the response's `Content-Range` can be checked.
 */
export const fetchHttp: Http = {
  async get(url, { from, signal }) {
    const response = await fetch(url, {
      headers: from > 0 ? { Range: `bytes=${from}-` } : {},
      signal,
    });
    const reader = response.body?.getReader();
    let pendingError: unknown = null;

    const result: HttpResponse = {
      status: response.status,
      contentRangeStart: parseContentRangeStart(response.headers.get('content-range')),
      async read() {
        if (pendingError) throw pendingError;
        if (!reader) return null;
        const parts: Uint8Array[] = [];
        let size = 0;
        try {
          while (size < READ_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value);
            size += value.length;
          }
        } catch (error) {
          // Hand on what arrived first; the error comes with the next read.
          if (size === 0) throw error;
          pendingError = error;
        }
        return size === 0 ? null : concat(parts, size);
      },
      cancel() {
        reader?.cancel().catch(() => {});
      },
    };
    return result;
  },
};

/** "bytes 100-199/200" → 100. */
function parseContentRangeStart(header: string | null): number | null {
  const match = header?.match(/^bytes (\d+)-/);
  return match ? Number(match[1]) : null;
}

function concat(parts: Uint8Array[], size: number): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const rnfsFileSystem: FileSystem = {
  async size(path) {
    if (!(await RNFS.exists(path))) return null;
    return Number((await RNFS.stat(path)).size);
  },
  sha256: (path) => RNFS.hash(path, 'sha256'),
  makeDirectory: (path) => RNFS.mkdir(path),
  append: (path, bytes) =>
    RNFS.appendFile(
      path,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    ),
  async move(from, to) {
    if (await RNFS.exists(to)) await RNFS.unlink(to);
    await RNFS.moveFile(from, to);
  },
  async remove(path) {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  },
  // The app's internal storage, where the model is installed.
  freeSpace: async () => (await RNFS.getFSInfo()).freeSpace,
};

export const expoNetwork: Network = {
  isOnMobileData: async () => (await getNetworkStateAsync()).type === NetworkStateType.CELLULAR,
};
