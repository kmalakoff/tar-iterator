import { bufferFrom } from 'extract-base-iterator';

if (!Buffer.from) {
  // @ts-expect-error
  Buffer.from = function _bufferFrom(data, encoding) {
    return bufferFrom(data, encoding);
  };
}
