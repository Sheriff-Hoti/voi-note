// The sherpa-onnx native module does not exist under Jest.
jest.mock('react-native-sherpa-onnx', () => ({
  testSherpaInit: jest.fn(() => Promise.resolve('mock')),
}));
jest.mock('react-native-sherpa-onnx/audio', () => ({
  createPcmLiveStream: jest.fn(() => ({
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    onData: jest.fn(() => () => {}),
    onError: jest.fn(() => () => {}),
  })),
}));
jest.mock('react-native-sherpa-onnx/stt', () => ({
  createSTT: jest.fn(() => Promise.reject(new Error('no Speech Model under Jest'))),
}));

// expo-sqlite on Node's built-in SQLite, in memory: the screens get real (empty) storage.
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = jest.requireActual<typeof import('node:sqlite')>('node:sqlite');
  return {
    openDatabaseAsync: jest.fn(async () => {
      const db = new DatabaseSync(':memory:');
      return {
        getAllAsync: async (sql: string, params: (string | number | null)[] = []) =>
          db.prepare(sql).all(...params),
      };
    }),
  };
});

// Nor does react-native-fs: an empty file system, so the Speech Model is not installed.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/files',
  exists: jest.fn(() => Promise.resolve(false)),
  stat: jest.fn(() => Promise.reject(new Error('no such file'))),
  hash: jest.fn(() => Promise.reject(new Error('no such file'))),
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  appendFile: jest.fn(() => Promise.resolve()),
  getFSInfo: jest.fn(() => Promise.resolve({ freeSpace: 10e9, totalSpace: 100e9 })),
}));

// Nor do expo/fetch and expo-network: no download gets a response, and the phone is on Wi-Fi.
jest.mock('expo/fetch', () => ({ fetch: jest.fn(() => new Promise(() => {})) }));
jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR' },
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ type: 'WIFI' })),
}));
