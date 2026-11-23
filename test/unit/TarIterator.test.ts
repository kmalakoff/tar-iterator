import assert from 'assert';
import { allocBuffer, PassThrough } from 'extract-base-iterator';
import fs from 'fs';
import { safeRm } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import type { Entry } from 'tar-iterator';
import TarIterator from 'tar-iterator';
import url from 'url';
import zlib from 'zlib';

import { getFixture } from '../lib/fixtures.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', '.tmp');
const TARGET = path.join(TMP_DIR, 'tar-iterator-unit');

const fixtureBuf = fs.readFileSync(getFixture('fixture.tar').path);
// Offset 1024 in fixture.tar is the 512-byte header for data/dir1/link1 (file, 61 bytes, ends at 2048).
const FILE_ENTRY_START = 1024;
const FILE_ENTRY_MID_1 = 1546;
const FILE_ENTRY_MID_2 = 1556;
const FILE_ENTRY_END = 2048;

function writeAscii(buf: Buffer, str: string, offset: number): void {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i);
  }
}

function createLargeTar(payloadSize: number): Buffer {
  const paddedSize = Math.ceil(payloadSize / 512) * 512;
  const tarBuf = allocBuffer(512 + paddedSize + 1024);

  writeAscii(tarBuf, 'big.bin', 0);
  writeAscii(tarBuf, '0000644\0', 100);
  writeAscii(tarBuf, '0000000\0', 108);
  writeAscii(tarBuf, '0000000\0', 116);
  const octalSize = `00000000000${payloadSize.toString(8)}`.slice(-11);
  writeAscii(tarBuf, `${octalSize}\0`, 124);
  writeAscii(tarBuf, '00000000000\0', 136);
  writeAscii(tarBuf, '        ', 148);
  writeAscii(tarBuf, '0', 156);
  writeAscii(tarBuf, 'ustar\0', 257);
  writeAscii(tarBuf, '00', 263);

  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += tarBuf[i];
  const octalSum = `000000${checksum.toString(8)}`.slice(-6);
  writeAscii(tarBuf, `${octalSum}\0 `, 148);

  // Deterministic xorshift32 payload so gzip is incompressible and spans multiple stream chunks.
  let seed = 0x12345678;
  for (let i = 0; i < payloadSize; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    tarBuf[512 + i] = seed & 0xff;
  }

  return tarBuf;
}

describe('TarIterator - late source errors', () => {
  beforeEach((callback) => {
    safeRm(TARGET, () => {
      mkdirp(TARGET, callback);
    });
  });

  afterEach((callback) => {
    safeRm(TARGET, callback);
  });

  it('calls back once on late source error before first header completes', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let cbCount = 0;

    iterator.forEach(
      (entry: Entry, cb: (err?: Error | null) => void) => {
        entry.destroy();
        cb();
      },
      { callbacks: true },
      (err?: Error | null) => {
        cbCount++;
        assert.strictEqual(cbCount, 1);
        assert.ok(err);
        assert.strictEqual(err?.message, 'late read failure');
        process.nextTick(() => {
          assert.strictEqual(cbCount, 1);
          done();
        });
      }
    );

    src.write(fixtureBuf.slice(0, 256), () => {
      src.emit('error', new Error('late read failure'));
    });
  });

  it('calls back both FileEntry.create and forEach once on late source error mid-entry', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let createCbCount = 0;
    let createError: Error | null | undefined = null;
    let forEachCbCount = 0;

    iterator.forEach(
      (entry: Entry, cb: (err?: Error | null) => void) => {
        entry.create(TARGET, {}, (err?: Error | null) => {
          createCbCount++;
          createError = err;
          cb(err);
        });
        src.write(fixtureBuf.slice(FILE_ENTRY_MID_1, FILE_ENTRY_MID_2), () => {
          src.emit('error', new Error('late read failure'));
        });
      },
      { callbacks: true },
      (err?: Error | null) => {
        forEachCbCount++;
        assert.strictEqual(forEachCbCount, 1);
        assert.strictEqual(createCbCount, 1);
        assert.ok(createError);
        assert.strictEqual(createError?.message, 'late read failure');
        assert.ok(err);
        assert.strictEqual(err?.message, 'late read failure');
        process.nextTick(() => {
          assert.strictEqual(createCbCount, 1);
          assert.strictEqual(forEachCbCount, 1);
          done();
        });
      }
    );

    src.write(fixtureBuf.slice(FILE_ENTRY_START, FILE_ENTRY_MID_1));
  });

  it('calls back once on late source error mid-entry after entry.destroy()', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let cbCount = 0;

    iterator.forEach(
      (entry: Entry, cb: (err?: Error | null) => void) => {
        entry.destroy();
        cb();
        src.write(fixtureBuf.slice(FILE_ENTRY_MID_1, FILE_ENTRY_MID_2), () => {
          src.emit('error', new Error('late read failure'));
        });
      },
      { callbacks: true },
      (err?: Error | null) => {
        cbCount++;
        assert.strictEqual(cbCount, 1);
        assert.ok(err);
        assert.strictEqual(err?.message, 'late read failure');
        process.nextTick(() => {
          assert.strictEqual(cbCount, 1);
          done();
        });
      }
    );

    src.write(fixtureBuf.slice(FILE_ENTRY_START, FILE_ENTRY_MID_1));
  });

  it('calls back once on late source error between entries after create completes', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let createCbCount = 0;
    let cbCount = 0;

    iterator.forEach(
      (entry: Entry, cb: (err?: Error | null) => void) => {
        entry.create(TARGET, {}, (err?: Error | null) => {
          assert.ifError(err);
          createCbCount++;
          cb();
          src.write(fixtureBuf.slice(FILE_ENTRY_END, FILE_ENTRY_END + 64), () => {
            src.emit('error', new Error('late read failure'));
          });
        });
      },
      { callbacks: true },
      (err?: Error | null) => {
        cbCount++;
        assert.strictEqual(cbCount, 1);
        assert.strictEqual(createCbCount, 1);
        assert.ok(err);
        assert.strictEqual(err?.message, 'late read failure');
        process.nextTick(() => {
          assert.strictEqual(cbCount, 1);
          done();
        });
      }
    );

    src.write(fixtureBuf.slice(FILE_ENTRY_START, FILE_ENTRY_END));
  });

  it('calls back once with zlib error from corrupted gzipped tar stream', (done) => {
    const badGzPath = path.join(TARGET, 'bad.tar.gz');
    const tarBuf = createLargeTar(128 * 1024);

    zlib.gzip(tarBuf, (gzErr, gzBuf) => {
      if (gzErr) return done(gzErr);

      const corruptOffset = Math.floor(gzBuf.length * 0.75);
      gzBuf[corruptOffset] ^= 0xff;

      fs.writeFile(badGzPath, gzBuf, (writeErr) => {
        if (writeErr) return done(writeErr);

        const source = fs.createReadStream(badGzPath).pipe(zlib.createUnzip());
        const iterator = new TarIterator(source);
        let createCbCount = 0;
        let createError: Error | null | undefined = null;
        let cbCount = 0;

        iterator.forEach(
          (entry: Entry, cb: (err?: Error | null) => void) => {
            entry.create(TARGET, {}, (err?: Error | null) => {
              createCbCount++;
              createError = err;
              cb(err);
            });
          },
          { callbacks: true },
          (err?: Error | null) => {
            cbCount++;
            assert.strictEqual(cbCount, 1);
            assert.strictEqual(createCbCount, 1);
            assert.ok(createError);
            assert.ok(err);
            process.nextTick(() => {
              assert.strictEqual(createCbCount, 1);
              assert.strictEqual(cbCount, 1);
              done();
            });
          }
        );
      });
    });
  });

  it('does not crash when source errors in pending-entry window before TarFileEntry attaches', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);

    src.write(fixtureBuf.slice(FILE_ENTRY_START, FILE_ENTRY_MID_2), () => {
      src.emit('error', new Error('pending entry error'));
      assert.strictEqual(iterator.isDone(), true);
      assert.strictEqual(iterator.extract, null);
      iterator.forEach(
        (entry: Entry, cb: (err?: Error | null) => void) => {
          entry.destroy();
          cb();
        },
        { callbacks: true },
        (err?: Error | null) => {
          assert.ifError(err);
          done();
        }
      );
    });
  });

  it('completes once with zero entries on 0-byte empty stream (forEach before end)', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let entries = 0;
    let cbCount = 0;

    iterator.forEach(
      (entry: Entry, cb: (err?: Error | null) => void) => {
        entries++;
        entry.destroy();
        cb();
      },
      { callbacks: true },
      (err?: Error | null) => {
        cbCount++;
        assert.ifError(err);
        assert.strictEqual(entries, 0);
        assert.strictEqual(cbCount, 1);
        process.nextTick(() => {
          assert.strictEqual(cbCount, 1);
          done();
        });
      }
    );

    src.end();
  });

  it('completes once with zero entries on 0-byte empty stream (end before forEach)', (done) => {
    const src = new PassThrough();
    const iterator = new TarIterator(src);
    let entries = 0;
    let cbCount = 0;

    src.once('end', () => {
      assert.strictEqual(iterator.isDone(), true);
      iterator.forEach(
        (entry: Entry, cb: (err?: Error | null) => void) => {
          entries++;
          entry.destroy();
          cb();
        },
        { callbacks: true },
        (err?: Error | null) => {
          cbCount++;
          assert.ifError(err);
          assert.strictEqual(entries, 0);
          assert.strictEqual(cbCount, 1);
          process.nextTick(() => {
            assert.strictEqual(cbCount, 1);
            done();
          });
        }
      );
    });

    src.end();
  });

  it('completes once with zero entries on 0-byte file', (done) => {
    const emptyFilePath = path.join(TARGET, 'zero-byte.tar');
    fs.writeFile(emptyFilePath, allocBuffer(0), (writeErr) => {
      if (writeErr) return done(writeErr);

      const iterator = new TarIterator(emptyFilePath);
      let entries = 0;
      let cbCount = 0;

      iterator.forEach(
        (entry: Entry, cb: (err?: Error | null) => void) => {
          entries++;
          entry.destroy();
          cb();
        },
        { callbacks: true },
        (err?: Error | null) => {
          cbCount++;
          assert.ifError(err);
          assert.strictEqual(entries, 0);
          assert.strictEqual(cbCount, 1);
          process.nextTick(() => {
            assert.strictEqual(cbCount, 1);
            done();
          });
        }
      );
    });
  });
});
