import { totalBytes, type SpeechModelFiles } from './installer';

const REPO = 'csukuangfj2/sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming';
const REVISION = '8c3a10fb13408c7a7054f6898958bf1c64a8d6c7';
const url = (name: string) => `https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`;

/**
 * The Speech Model (ADR 0001): Parakeet Unified EN 0.6B, offline int8 export, pinned to one Hugging Face
 * revision. Sizes and SHA-256s were computed from that revision's files (the LFS files' hashes also
 * match Hugging Face's LFS oids). Small files first, so a bad pin fails fast.
 */
export const PARAKEET_UNIFIED_EN = {
  id: 'parakeet-unified-en-0.6b-int8',
  label: 'Parakeet Unified EN',
  files: [
    {
      name: 'tokens.txt',
      url: url('tokens.txt'),
      size: 8_952,
      sha256: 'dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff',
    },
    {
      name: 'joiner.int8.onnx',
      url: url('joiner.int8.onnx'),
      size: 1_735_860,
      sha256: '869f43f7d24595c55581ad3bf249a935fb8a71389fbdaa7504b9f46f93140f8a',
    },
    {
      name: 'decoder.int8.onnx',
      url: url('decoder.int8.onnx'),
      size: 7_257_753,
      sha256: 'a5e223392c90e75f8144cdb5eb95af7625db389e39edef2bd1a9c872b3298fe6',
    },
    {
      name: 'encoder.int8.onnx',
      url: url('encoder.int8.onnx'),
      size: 654_040_552,
      sha256: '6716910b7a0833997fec7a410494c995d70124001a0e9b66d6370d6aced577e0',
    },
  ],
} as const satisfies SpeechModelFiles & { id: string; label: string };

export const PARAKEET_UNIFIED_EN_BYTES = totalBytes(PARAKEET_UNIFIED_EN);
