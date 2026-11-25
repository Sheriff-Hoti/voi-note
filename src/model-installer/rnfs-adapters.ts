import * as RNFS from '@dr.pogodin/react-native-fs';

import type { FileSystem, Http } from './ports';

export const rnfsHttp: Http = {
  async download(url, path, onProgress) {
    const { promise } = RNFS.downloadFile({
      fromUrl: url,
      toFile: path,
      progressInterval: 250,
      begin: () => {},
      progress: (p) => onProgress(p.bytesWritten),
    });
    const result = await promise;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`HTTP ${result.statusCode} downloading ${url}`);
    }
    onProgress(result.bytesWritten);
  },
};

export const rnfsFileSystem: FileSystem = {
  async size(path) {
    if (!(await RNFS.exists(path))) return null;
    return Number((await RNFS.stat(path)).size);
  },
  sha256: (path) => RNFS.hash(path, 'sha256'),
  makeDirectory: (path) => RNFS.mkdir(path),
  async move(from, to) {
    if (await RNFS.exists(to)) await RNFS.unlink(to);
    await RNFS.moveFile(from, to);
  },
  async remove(path) {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  },
};
