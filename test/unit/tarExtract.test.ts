/**
 * Comprehensive TAR format tests using tar-stream fixtures
 *
 * Test Matrix:
 * ┌─────────────────────────┬───────────┬─────────────────────────────────────┐
 * │ Feature                 │ Fixture   │ What it tests                       │
 * ├─────────────────────────┼───────────┼─────────────────────────────────────┤
 * │ GNU long paths          │ gnu-long-path.tar │ Paths >100 chars via 'L' type │
 * │ PAX extended headers    │ pax.tar   │ PAX 'x' type headers                │
 * │ PAX long paths          │ long-path.tar │ Paths >100 chars via PAX        │
 * │ USTAR prefix            │ long-name.tar │ Paths using prefix field        │
 * │ Unicode paths           │ unicode.tar │ UTF-8 non-ASCII filenames         │
 * │ Unicode BSD             │ unicode-bsd.tar │ BSD-style unicode             │
 * │ Base-256 uid/gid        │ base-256-uid-gid.tar │ Large uid/gid values      │
 * │ Base-256 size           │ base-256-size.tar │ Size field encoding         │
 * │ Entry types             │ types.tar │ Directories, symlinks               │
 * │ Name exactly 100 chars  │ name-is-100.tar │ Boundary condition           │
 * │ GNU format              │ gnu.tar   │ GNU magic/version                   │
 * │ V7 format               │ v7.tar    │ Old V7 format (may need flag)       │
 * │ Spaces in octal         │ space.tar │ Octal fields with spaces            │
 * │ Basic files             │ fixture.tar │ Dirs, files, symlinks, hardlinks  │
 * │ Gzip compression        │ fixture.tar.gz │ Gzip decompression             │
 * │ Bz2 compression         │ fixture.tar.bz2 │ Bzip2 decompression           │
 * └─────────────────────────┴───────────┴─────────────────────────────────────┘
 */

import assert from 'assert';
import { allocBuffer, allocBufferUnsafe } from 'extract-base-iterator';
import fs from 'fs';
import path from 'path';
import TarIterator, { type TarCodedError, TarErrorCode } from 'tar-iterator';
import zlib from 'zlib';
import bz2 from '../lib/bz2-stream.ts';
import { DATA_DIR, TMP_DIR } from '../lib/constants.ts';

interface Entry {
  path: string;
  type: string;
  size?: number;
  linkname?: string;
  uid?: number;
  gid?: number;
  mode?: number;
  mtime?: Date;
}

/**
 * Helper to extract all entries from a tar file
 */
function extractEntries(tarPath: string, callback: (err: Error | null, entries?: Entry[]) => void): void {
  const iterator = new TarIterator(tarPath);
  const entries: Entry[] = [];

  iterator.forEach(
    (entry): undefined => {
      entries.push({
        path: entry.path,
        type: entry.type,
        size: entry.size,
        linkname: entry.linkname,
        uid: entry.uid,
        gid: entry.gid,
        mode: entry.mode,
        mtime: entry.mtime,
      });
      entry.destroy();
    },
    (err): undefined => {
      if (err) return callback(err) as undefined;
      callback(null, entries);
    }
  );
}

describe('TarExtract - Format Support', () => {
  describe('GNU Extensions', () => {
    it('extracts GNU long paths (>100 chars)', (done) => {
      const tarPath = path.join(DATA_DIR, 'gnu-long-path.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        const entry = entries?.[0];
        assert.ok(entry.path.length > 100, `Path should be >100 chars, got ${entry.path.length}`);
        assert.ok(entry.path.indexOf('node-v0.11.14') !== -1, 'Should contain expected path segment');
        assert.strictEqual(entry.type, 'file');
        done();
      });
    });

    it('extracts GNU format archives', (done) => {
      const tarPath = path.join(DATA_DIR, 'gnu.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        const entry = entries?.[0];
        assert.strictEqual(entry.path, 'test.txt');
        assert.strictEqual(entry.type, 'file');
        assert.strictEqual(entry.size, 14);
        done();
      });
    });
  });

  describe('PAX Extensions', () => {
    it('extracts PAX format archives', (done) => {
      const tarPath = path.join(DATA_DIR, 'pax.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        const entry = entries?.[0];
        assert.strictEqual(entry.path, 'pax.txt');
        assert.strictEqual(entry.type, 'file');
        assert.strictEqual(entry.size, 12);
        done();
      });
    });

    it('extracts PAX long paths (our fixture)', (done) => {
      const tarPath = path.join(DATA_DIR, 'long-path.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        // Find the longest path
        const longest = entries?.reduce((max, e) => (e.path.length > max.path.length ? e : max), entries?.[0]);
        assert.ok(longest.path.length > 100, `Longest path (${longest.path.length}) should be >100 chars`);

        // Should contain the expected file
        const hasFile = entries?.some((e) => e.path.indexOf('file.txt') !== -1 && e.type === 'file');
        assert.ok(hasFile, 'Should have file.txt entry');
        done();
      });
    });

    // PAX global headers test - GitHub archives use 'g' type global headers
    // The test fixture needs to be downloaded first: curl -L -o .tmp/fixtures/tar-stream-master.tar.gz "https://github.com/mafintosh/tar-stream/archive/refs/heads/master.tar.gz"
    it('extracts archives with PAX global headers (GitHub archives)', function (done) {
      const fixtureDir = path.join(TMP_DIR, 'fixtures');
      const fixturePath = path.join(fixtureDir, 'tar-stream-master.tar.gz');

      // Skip if fixture doesn't exist (not downloaded)
      if (!fs.existsSync(fixturePath)) {
        console.log('    (skipping - fixture not downloaded)');
        this.skip();
        return;
      }

      // Create piped stream from gzipped tar
      const source = fs.createReadStream(fixturePath).pipe(zlib.createUnzip());
      const iterator = new TarIterator(source);
      const entries: Entry[] = [];

      iterator.forEach(
        (entry): undefined => {
          entries.push({
            path: entry.path,
            type: entry.type,
            size: entry.size,
          });
          entry.destroy();
        },
        (err): undefined => {
          if (err) return done(err) as undefined;

          // GitHub archives have PAX global headers - verify extraction works
          assert.ok(entries.length > 30, 'Should have many entries (GitHub archive)');

          // Verify expected structure of tar-stream archive
          const hasMaster = entries.some((e) => e.path.indexOf('tar-stream-master') !== -1);
          assert.ok(hasMaster, 'Should contain tar-stream-master directory');

          const hasPackageJson = entries.some((e) => e.path.indexOf('package.json') !== -1 && e.type === 'file');
          assert.ok(hasPackageJson, 'Should contain package.json file');

          done();
        }
      );
    });
  });

  describe('USTAR Format', () => {
    it('extracts USTAR prefix for long paths', (done) => {
      const tarPath = path.join(DATA_DIR, 'long-name.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        const entry = entries?.[0];
        assert.ok(entry.path.length > 100, `Path should be >100 chars, got ${entry.path.length}`);
        assert.ok(entry.path.indexOf('filename.txt') !== -1, 'Should contain filename.txt');
        assert.strictEqual(entry.type, 'file');
        assert.strictEqual(entry.size, 16);
        done();
      });
    });

    it('handles name exactly 100 characters', (done) => {
      const tarPath = path.join(DATA_DIR, 'name-is-100.tar');
      extractEntries(tarPath, (err, entries) => {
        if (err) return done(err);
        assert.ok(entries && entries.length > 0, 'Should have entries');

        const entry = entries?.[0];
        assert.strictEqual(entry.path.length, 100, 'Path should be exactly 100 chars');
        assert.strictEqual(entry.type, 'file');
        done();
      });
    });
  });

  describe('V7 Format', () => {
    it('fails on V7 format without allowUnknownFormat flag (expected)', (done) => {
      // V7 format doesn't have USTAR/GNU magic - our parser rejects it by default
      // This is intentional - V7 is a legacy format and most modern tar files use USTAR or GNU
      const tarPath = path.join(DATA_DIR, 'v7.tar');
      const iterator = new TarIterator(tarPath);

      iterator.forEach(
        (entry): undefined => {
          entry.destroy();
        },
        (err) => {
          // V7 should fail with unknown format error
          assert.ok(err, 'Should fail for V7 format');
          assert.ok(err.message.indexOf('unknown format') !== -1 || err.message.indexOf('Invalid tar header') !== -1, 'Should fail with format error');
          done();
        }
      );
    });
  });
});

describe('TarExtract - Unicode Support', () => {
  it('extracts unicode filenames (UTF-8)', (done) => {
    const tarPath = path.join(DATA_DIR, 'unicode.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const entry = entries?.[0];
      // høstål.txt contains Norwegian characters - must match exactly, no fallbacks
      assert.strictEqual(entry.path, 'høstål.txt', 'Should have correct unicode filename');
      assert.strictEqual(entry.type, 'file');
      assert.strictEqual(entry.size, 8);
      done();
    });
  });

  it('extracts unicode filenames (BSD style)', (done) => {
    const tarPath = path.join(DATA_DIR, 'unicode-bsd.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const entry = entries?.[0];
      assert.strictEqual(entry.path, 'høllø.txt', 'Should have correct BSD unicode filename');
      assert.strictEqual(entry.type, 'file');
      assert.strictEqual(entry.size, 4);
      done();
    });
  });

  it('extracts latin1 encoded filenames', (done) => {
    // This tar has Latin1 encoded filename with ç (0xe7) and î (0xee)
    // Default UTF-8 decoding will produce replacement chars, but should not crash
    // The important thing is the file extracts and has correct metadata
    const tarPath = path.join(DATA_DIR, 'latin1.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const entry = entries?.[0];
      // Path should start with "En fran" and end with ".txt" even if middle chars are garbled
      assert.ok(entry.path.indexOf('En fran') === 0, 'Should start with "En fran"');
      assert.ok(entry.path.indexOf('.txt') !== -1, 'Should end with .txt');
      assert.strictEqual(entry.type, 'file');
      assert.strictEqual(entry.size, 14);
      done();
    });
  });
});

describe('TarExtract - Base-256 Encoding', () => {
  it('extracts large uid/gid values (base-256)', (done) => {
    const tarPath = path.join(DATA_DIR, 'base-256-uid-gid.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const entry = entries?.[0];
      // The fixture uses base-256 encoding (high bit set) for uid/gid fields
      // Verify we correctly decode these base-256 encoded values
      assert.strictEqual(entry.uid, 116435139, 'Should decode base-256 uid correctly');
      assert.strictEqual(entry.gid, 1876110778, 'Should decode base-256 gid correctly');
      done();
    });
  });

  it('extracts base-256 size encoding', (done) => {
    const tarPath = path.join(DATA_DIR, 'base-256-size.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const entry = entries?.[0];
      assert.strictEqual(entry.path, 'test.txt');
      assert.strictEqual(entry.size, 12);
      done();
    });
  });
});

describe('TarExtract - Entry Types', () => {
  it('extracts directories and symlinks', (done) => {
    const tarPath = path.join(DATA_DIR, 'types.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length >= 2, 'Should have at least 2 entries');

      const dir = entries?.filter((e) => e.type === 'directory')[0];
      const link = entries?.filter((e) => e.type === 'symlink')[0];

      assert.ok(dir, 'Should have a directory entry');
      assert.strictEqual(dir?.path, 'directory');

      assert.ok(link, 'Should have a symlink entry');
      assert.strictEqual(link?.path, 'directory-link');
      assert.strictEqual(link?.linkname, 'directory');
      done();
    });
  });

  it('extracts all basic types from fixture.tar', (done) => {
    const tarPath = path.join(DATA_DIR, 'fixture.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      // Check for each type using .some() (ES5 compatible, unlike Set)
      assert.ok(
        entries?.some((e) => e.type === 'directory'),
        'Should have directories'
      );
      assert.ok(
        entries?.some((e) => e.type === 'file'),
        'Should have files'
      );
      assert.ok(
        entries?.some((e) => e.type === 'symlink'),
        'Should have symlinks'
      );
      assert.ok(
        entries?.some((e) => e.type === 'link'),
        'Should have hardlinks'
      );
      done();
    });
  });
});

describe('TarExtract - Error Handling', () => {
  const corruptedTarPath = path.join(TMP_DIR, 'corrupted-checksum.tar');

  before((done) => {
    // Create corrupted tar by reading a valid tar and corrupting the checksum
    const sourceTar = path.join(DATA_DIR, 'types.tar');
    fs.readFile(sourceTar, (err, data) => {
      if (err) return done(err);
      // Corrupt the checksum bytes at offset 148-155
      for (let i = 148; i < 156; i++) {
        data[i] = 0xff;
      }
      fs.writeFile(corruptedTarPath, data, done);
    });
  });

  it('rejects archives with corrupted checksums', (done) => {
    const iterator = new TarIterator(corruptedTarPath);

    iterator.forEach(
      (entry): undefined => {
        entry.destroy();
      },
      (err) => {
        // Should fail with checksum/corruption error
        assert.ok(err, 'Should fail for corrupted checksum');
        assert.ok(err.message.indexOf('checksum') !== -1 || err.message.indexOf('Invalid tar header') !== -1 || err.message.indexOf('corrupted') !== -1, `Should fail with checksum error, got: ${err.message}`);
        // Verify error code for programmatic handling
        assert.strictEqual((err as TarCodedError).code, TarErrorCode.INVALID_CHECKSUM, 'Should have INVALID_CHECKSUM error code');
        done();
      }
    );
  });
});

describe('TarExtract - Edge Cases', () => {
  const emptyTarPath = path.join(TMP_DIR, 'empty.tar');

  before((done) => {
    // Create empty tar (two 512-byte blocks of zeros)
    const emptyBuffer = allocBuffer(1024);
    fs.writeFile(emptyTarPath, emptyBuffer, done);
  });

  it('handles empty archives', (done) => {
    extractEntries(emptyTarPath, (err, entries) => {
      if (err) return done(err);
      assert.strictEqual(entries?.length, 0, 'Empty archive should have no entries');
      done();
    });
  });

  it('handles octal fields with spaces', (done) => {
    const tarPath = path.join(DATA_DIR, 'space.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      // Space.tar has multiple files
      assert.ok(entries?.length >= 4, 'Should have at least 4 entries');
      const hasJson = entries?.some((e) => e.path.indexOf('package.json') !== -1);
      assert.ok(hasJson, 'Should contain package.json');
      done();
    });
  });

  it('extracts regular tar files', (done) => {
    const tarPath = path.join(DATA_DIR, 'fixture.tar');
    extractEntries(tarPath, (err, entries) => {
      if (err) return done(err);
      assert.ok(entries && entries.length > 0, 'Should have entries');

      const dirs = entries?.filter((e) => e.type === 'directory');
      assert.ok(dirs.length > 0, 'Should have directory entries');

      const files = entries?.filter((e) => e.type === 'file');
      assert.ok(files.length > 0, 'Should have file entries');
      done();
    });
  });
});

describe('TarExtract - File Content', () => {
  it('reads file content correctly', (done) => {
    // This test verifies that file data streaming actually works
    // gnu.tar contains test.txt with "Hello, world!\n" (14 bytes)
    const tarPath = path.join(DATA_DIR, 'gnu.tar');
    const iterator = new TarIterator(tarPath);
    let contentRead = '';

    iterator.forEach(
      (entry): undefined => {
        if (entry.path === 'test.txt' && entry.type === 'file') {
          // Actually read the file content
          const chunks: Buffer[] = [];
          entry.stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          entry.stream.on('end', () => {
            // Concatenate chunks
            let totalLength = 0;
            for (let i = 0; i < chunks.length; i++) totalLength += chunks[i].length;
            const content = allocBufferUnsafe(totalLength);
            let offset = 0;
            for (let i = 0; i < chunks.length; i++) {
              chunks[i].copy(content, offset);
              offset += chunks[i].length;
            }
            contentRead = content.toString('utf8');
            // Must call destroy to signal entry is fully consumed
            entry.destroy();
          });
          entry.stream.resume();
        } else {
          entry.destroy();
        }
      },
      (err): undefined => {
        if (err) return done(err) as undefined;
        // Verify we actually read the expected content
        assert.strictEqual(contentRead, 'Hello, world!\n', 'File content should match expected value');
        done();
      }
    );
  });
});

describe('TarExtract - Compression', () => {
  it('extracts gzip compressed tar', (done) => {
    const tarPath = path.join(DATA_DIR, 'fixture.tar.gz');
    const source = fs.createReadStream(tarPath).pipe(zlib.createUnzip());
    const iterator = new TarIterator(source);
    const entries: Entry[] = [];

    iterator.forEach(
      (entry): undefined => {
        entries.push({
          path: entry.path,
          type: entry.type,
          size: entry.size,
        });
        entry.destroy();
      },
      (err): undefined => {
        if (err) return done(err) as undefined;
        assert.ok(entries.length > 0, 'Should have entries');
        // Check for each type using .some() (ES5 compatible, unlike Set)
        assert.ok(
          entries.some((e) => e.type === 'directory'),
          'Should have directories'
        );
        assert.ok(
          entries.some((e) => e.type === 'file'),
          'Should have files'
        );
        done();
      }
    );
  });

  it('extracts bzip2 compressed tar', (done) => {
    const tarPath = path.join(DATA_DIR, 'fixture.tar.bz2');
    const source = fs.createReadStream(tarPath).pipe(bz2());
    const iterator = new TarIterator(source);
    const entries: Entry[] = [];

    iterator.forEach(
      (entry): undefined => {
        entries.push({
          path: entry.path,
          type: entry.type,
          size: entry.size,
        });
        entry.destroy();
      },
      (err): undefined => {
        if (err) return done(err) as undefined;
        assert.ok(entries.length > 0, 'Should have entries');
        // Check for each type using .some() (ES5 compatible, unlike Set)
        assert.ok(
          entries.some((e) => e.type === 'directory'),
          'Should have directories'
        );
        assert.ok(
          entries.some((e) => e.type === 'file'),
          'Should have files'
        );
        done();
      }
    );
  });
});

describe('TarExtract - GNU Sparse Files', () => {
  it('extracts sparse files with holes reconstructed', (done) => {
    // sparse.tar contains a file with:
    // - Real size: 1024 bytes
    // - Actual data: "AAAA" at offset 0, "BBBB" at offset 512
    // - Holes: zeros from 4-511 and 516-1023
    const tarPath = path.join(DATA_DIR, 'sparse.tar');
    const iterator = new TarIterator(tarPath);

    iterator.forEach(
      (entry): undefined => {
        assert.strictEqual(entry.path, 'sparse-test.txt', 'Should have correct filename');
        assert.strictEqual(entry.type, 'file', 'Should report type as file (not gnu-sparse)');
        assert.strictEqual(entry.size, 1024, 'Should report reconstructed file size');

        // Read all content to verify reconstruction
        const chunks: Buffer[] = [];
        entry.stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        entry.stream.on('end', () => {
          // Concatenate chunks
          let totalLength = 0;
          for (let i = 0; i < chunks.length; i++) totalLength += chunks[i].length;
          const content = allocBufferUnsafe(totalLength);
          let offset = 0;
          for (let i = 0; i < chunks.length; i++) {
            chunks[i].copy(content, offset);
            offset += chunks[i].length;
          }

          // Verify content
          assert.strictEqual(content.length, 1024, 'Reconstructed content should be 1024 bytes');
          assert.strictEqual(content.slice(0, 4).toString(), 'AAAA', 'First 4 bytes should be "AAAA"');
          assert.strictEqual(content.slice(512, 516).toString(), 'BBBB', 'Bytes at 512-515 should be "BBBB"');

          // Verify holes are zeros
          let holesCorrect = true;
          for (let i = 4; i < 512; i++) {
            if (content[i] !== 0) {
              holesCorrect = false;
              break;
            }
          }
          for (let i = 516; i < 1024; i++) {
            if (content[i] !== 0) {
              holesCorrect = false;
              break;
            }
          }
          assert.ok(holesCorrect, 'Holes should be filled with zeros');

          entry.destroy();
        });
        entry.stream.resume();
      },
      (err): undefined => {
        if (err) return done(err) as undefined;
        done();
      }
    );
  });
});
