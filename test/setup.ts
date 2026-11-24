// The sherpa-onnx native module does not exist under Jest.
jest.mock('react-native-sherpa-onnx', () => ({
  testSherpaInit: jest.fn(() => Promise.resolve('mock')),
}));

// Nor does react-native-fs: an empty file system, so the Speech Model is not installed.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/data/files',
  exists: jest.fn(() => Promise.resolve(false)),
  stat: jest.fn(() => Promise.reject(new Error('no such file'))),
  hash: jest.fn(() => Promise.reject(new Error('no such file'))),
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({ jobId: 1, promise: new Promise(() => {}) })),
}));
