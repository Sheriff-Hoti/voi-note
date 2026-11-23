// The sherpa-onnx native module does not exist under Jest.
jest.mock('react-native-sherpa-onnx', () => ({
  testSherpaInit: jest.fn(() => Promise.resolve('mock')),
}));
