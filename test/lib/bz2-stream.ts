/**
 * Node 0.8+ compatible bzip2 stream wrapper
 *
 * This is a wrapper around unbzip2-stream's core lib files that replaces
 * Buffer.from() with a compatible alternative for Node.js 0.8+.
 *
 * The original unbzip2-stream has a bug where it uses Buffer.from() directly
 * without importing it from its 'buffer' dependency, breaking Node < 4.5.
 */

import { bufferFrom } from 'extract-base-iterator';
import Module from 'module';
import through from 'through';

// ESM-compatible require for CommonJS modules
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;
const bitIterator = _require('unbzip2-stream/lib/bit_iterator');
const bz2 = _require('unbzip2-stream/lib/bzip2');

interface BitReader {
  (n: number | null): number;
  bytesRead: number;
}

export default function unbzip2Stream(): NodeJS.ReadWriteStream {
  const bufferQueue: Buffer[] = [];
  let hasBytes = 0;
  let blockSize = 0;
  let broken = false;
  let bitReader: BitReader | null = null;
  let streamCRC: number | null = null;

  function decompressBlock(push: (buf: Buffer) => void): boolean {
    if (!blockSize) {
      blockSize = bz2.header(bitReader);
      streamCRC = 0;
      return true;
    }
    const bufsize = 100000 * blockSize;
    const buf = new Int32Array(bufsize);

    const chunk: number[] = [];
    const f = (b: number) => {
      chunk.push(b);
    };

    streamCRC = bz2.decompress(bitReader, f, buf, bufsize, streamCRC);
    if (streamCRC === null) {
      // reset for next bzip2 header
      blockSize = 0;
      return false;
    }
    // Use our compatible bufferFrom instead of Buffer.from
    push(bufferFrom(chunk));
    return true;
  }

  let _outlength = 0;
  function decompressAndQueue(stream: through.ThroughStream): boolean | undefined {
    if (broken) return;
    try {
      return decompressBlock((d) => {
        stream.queue(d);
        if (d !== null) {
          _outlength += d.length;
        }
      });
    } catch (e) {
      stream.emit('error', e);
      broken = true;
      return false;
    }
  }

  return through(
    function write(this: through.ThroughStream, data: Buffer) {
      bufferQueue.push(data);
      hasBytes += data.length;
      if (bitReader === null) {
        bitReader = bitIterator(() => bufferQueue.shift());
      }
      while (!broken && hasBytes - bitReader.bytesRead + 1 >= (25000 + 100000 * blockSize || 4)) {
        decompressAndQueue(this);
      }
    },
    function end(this: through.ThroughStream) {
      while (!broken && bitReader && hasBytes > bitReader.bytesRead) {
        decompressAndQueue(this);
      }
      if (!broken) {
        if (streamCRC !== null) this.emit('error', new Error('input stream ended prematurely'));
        this.queue(null);
      }
    }
  );
}
