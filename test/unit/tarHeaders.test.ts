/**
 * Unit tests for TAR header parsing
 */

import assert from 'assert';
import { allocBuffer, bufferFrom } from 'extract-base-iterator';
import { checksum, decodeLongPath, decodeOct, decodePax, isGnu, isUstar, overflow, parseHeader, toType } from '../../src/tar/headers.ts';

// Helper to create a 512-byte header buffer
function createHeader(fields: { name?: string; mode?: number; uid?: number; gid?: number; size?: number; mtime?: number; typeflag?: number; type?: string; linkname?: string; uname?: string; gname?: string; devmajor?: number; devminor?: number; prefix?: string }): Buffer {
  const buf = allocBuffer(512);

  // Name (offset 0, 100 bytes)
  if (fields.name) {
    buf.write(fields.name, 0, 100, 'utf8');
  }

  // Mode (offset 100, 8 bytes) - octal string
  writeOctal(buf, 100, 8, fields.mode !== undefined ? fields.mode : 420);

  // UID (offset 108, 8 bytes)
  writeOctal(buf, 108, 8, fields.uid || 0);

  // GID (offset 116, 8 bytes)
  writeOctal(buf, 116, 8, fields.gid || 0);

  // Size (offset 124, 12 bytes)
  writeOctal(buf, 124, 12, fields.size || 0);

  // Mtime (offset 136, 12 bytes)
  writeOctal(buf, 136, 12, fields.mtime || Math.floor(Date.now() / 1000));

  // Typeflag (offset 156, 1 byte)
  let typeflag = fields.typeflag;
  if (typeflag === undefined) {
    typeflag = fields.type === 'directory' ? 53 : 48; // '5' or '0'
  }
  buf[156] = typeflag;

  // Linkname (offset 157, 100 bytes)
  if (fields.linkname) {
    buf.write(fields.linkname, 157, 100, 'utf8');
  }

  // Magic (offset 257, 6 bytes) - "ustar\0"
  buf.write('ustar', 257, 5, 'utf8');
  buf[262] = 0;

  // Version (offset 263, 2 bytes) - "00"
  buf[263] = 48; // '0'
  buf[264] = 48; // '0'

  // Uname (offset 265, 32 bytes)
  if (fields.uname) {
    buf.write(fields.uname, 265, 32, 'utf8');
  }

  // Gname (offset 297, 32 bytes)
  if (fields.gname) {
    buf.write(fields.gname, 297, 32, 'utf8');
  }

  // Devmajor (offset 329, 8 bytes)
  writeOctal(buf, 329, 8, fields.devmajor || 0);

  // Devminor (offset 337, 8 bytes)
  writeOctal(buf, 337, 8, fields.devminor || 0);

  // Prefix (offset 345, 155 bytes)
  if (fields.prefix) {
    buf.write(fields.prefix, 345, 155, 'utf8');
  }

  // Calculate and write checksum (offset 148, 8 bytes)
  // First fill checksum field with spaces
  for (let i = 148; i < 156; i++) buf[i] = 32;
  const cksum = checksum(buf);
  writeOctal(buf, 148, 8, cksum);

  return buf;
}

function writeOctal(buf: Buffer, offset: number, length: number, value: number): void {
  let str = value.toString(8);
  while (str.length < length - 1) str = `0${str}`;
  buf.write(str, offset, length - 1, 'utf8');
  buf[offset + length - 1] = 0;
}

describe('TAR headers', () => {
  describe('parseHeader', () => {
    it('parses basic file header', () => {
      const buf = createHeader({
        name: 'test.txt',
        size: 1234,
        mode: 420,
        uid: 1000,
        gid: 1000,
        uname: 'testuser',
        gname: 'testgroup',
        typeflag: 48,
      });

      const header = parseHeader(buf);
      assert.ok(header);
      assert.strictEqual(header.name, 'test.txt');
      assert.strictEqual(header.size, 1234);
      assert.strictEqual(header.mode, 420);
      assert.strictEqual(header.uid, 1000);
      assert.strictEqual(header.gid, 1000);
      assert.strictEqual(header.type, 'file');
      assert.strictEqual(header.uname, 'testuser');
      assert.strictEqual(header.gname, 'testgroup');
    });

    it('parses directory header', () => {
      const buf = createHeader({
        name: 'testdir/',
        mode: 493,
        typeflag: 53,
      });

      const header = parseHeader(buf);
      assert.ok(header);
      assert.strictEqual(header.name, 'testdir/');
      assert.strictEqual(header.type, 'directory');
      assert.strictEqual(header.mode, 493);
    });

    it('parses symlink header', () => {
      const buf = createHeader({
        name: 'link.txt',
        linkname: 'target.txt',
        typeflag: 50,
      });

      const header = parseHeader(buf);
      assert.ok(header);
      assert.strictEqual(header.name, 'link.txt');
      assert.strictEqual(header.type, 'symlink');
      assert.strictEqual(header.linkname, 'target.txt');
    });

    it('parses hardlink header', () => {
      const buf = createHeader({
        name: 'hardlink.txt',
        linkname: 'original.txt',
        typeflag: 49,
      });

      const header = parseHeader(buf);
      assert.ok(header);
      assert.strictEqual(header.type, 'link');
      assert.strictEqual(header.linkname, 'original.txt');
    });

    it('handles USTAR prefix for long paths', () => {
      const buf = createHeader({
        prefix: 'very/long/directory/path/that/exceeds/one/hundred/characters',
        name: 'filename.txt',
      });

      const header = parseHeader(buf);
      assert.ok(header);
      assert.strictEqual(header.name, 'very/long/directory/path/that/exceeds/one/hundred/characters/filename.txt');
    });

    it('returns null for empty block', () => {
      const buf = allocBuffer(512);
      const header = parseHeader(buf);
      assert.strictEqual(header, null);
    });

    it('returns file type for trailing slash (conversion happens in TarExtract)', () => {
      // Note: Old tar versions use trailing '/' to indicate directories.
      // This conversion is intentionally done in TarExtract._applyExtensions()
      // AFTER GNU/PAX extensions are applied (to avoid misclassifying files
      // with >100 char paths where the truncated name happens to end with '/').
      // parseHeader() does NOT do this conversion anymore.
      const buf = createHeader({
        name: 'oldstyle/',
        typeflag: 48, // '0' = regular file
      });

      const header = parseHeader(buf);
      assert.ok(header);
      // parseHeader returns 'file' for typeflag '0', the trailing slash
      // conversion to 'directory' happens later in TarExtract
      assert.strictEqual(header.type, 'file');
    });
  });

  describe('decodeOct', () => {
    it('decodes basic octal', () => {
      const buf = bufferFrom('0000755\0');
      assert.strictEqual(decodeOct(buf, 0, 8), 493);
    });

    it('handles leading spaces', () => {
      const buf = bufferFrom('   755 \0');
      assert.strictEqual(decodeOct(buf, 0, 8), 493);
    });

    it('decodes zero', () => {
      const buf = bufferFrom('0000000\0');
      assert.strictEqual(decodeOct(buf, 0, 8), 0);
    });
  });

  describe('decodePax', () => {
    it('decodes basic PAX record', () => {
      const pax = '21 path=longname.txt\n';
      const buf = bufferFrom(pax);
      const result = decodePax(buf);
      assert.strictEqual(result.path, 'longname.txt');
    });

    it('decodes multiple PAX fields', () => {
      const pax = '21 path=longname.txt\n19 linkpath=target\n';
      const buf = bufferFrom(pax);
      const result = decodePax(buf);
      assert.strictEqual(result.path, 'longname.txt');
      assert.strictEqual(result.linkpath, 'target');
    });
  });

  describe('decodeLongPath', () => {
    it('decodes GNU long path', () => {
      const longPath = 'this/is/a/very/long/path/that/exceeds/the/maximum/length/allowed/in/standard/tar/headers/filename.txt';
      const buf = bufferFrom(`${longPath}\0`);
      const result = decodeLongPath(buf, 'utf8');
      assert.strictEqual(result, longPath);
    });
  });

  describe('overflow', () => {
    it('returns 0 when no padding needed', () => {
      assert.strictEqual(overflow(512), 0);
      assert.strictEqual(overflow(1024), 0);
    });

    it('calculates padding correctly', () => {
      assert.strictEqual(overflow(100), 412);
      assert.strictEqual(overflow(513), 511);
      assert.strictEqual(overflow(1), 511);
    });
  });

  describe('toType', () => {
    it('converts standard types', () => {
      assert.strictEqual(toType(0), 'file');
      assert.strictEqual(toType(1), 'link');
      assert.strictEqual(toType(2), 'symlink');
      assert.strictEqual(toType(3), 'character-device');
      assert.strictEqual(toType(4), 'block-device');
      assert.strictEqual(toType(5), 'directory');
      assert.strictEqual(toType(6), 'fifo');
      assert.strictEqual(toType(7), 'contiguous-file');
    });

    it('converts special types', () => {
      assert.strictEqual(toType(76), 'gnu-long-path');
      assert.strictEqual(toType(75), 'gnu-long-link-path');
      assert.strictEqual(toType(120), 'pax-header');
      assert.strictEqual(toType(103), 'pax-global-header');
    });

    it('converts GNU extension types', () => {
      // These are rare but valid GNU tar extension types
      assert.strictEqual(toType(83), 'gnu-sparse'); // 'S' - sparse file
      assert.strictEqual(toType(68), 'gnu-dumpdir'); // 'D' - directory dump
      assert.strictEqual(toType(77), 'gnu-multivol'); // 'M' - multi-volume
      assert.strictEqual(toType(86), 'gnu-volume-header'); // 'V' - volume header
    });

    it('returns null for unknown types', () => {
      assert.strictEqual(toType(99), null); // 'c' - not a valid type
      assert.strictEqual(toType(255), null); // invalid
    });
  });

  describe('checksum', () => {
    it('validates correct headers', () => {
      const buf = createHeader({ name: 'test.txt', size: 100 });
      const header = parseHeader(buf);
      assert.ok(header);
    });

    it('detects corruption', () => {
      const buf = createHeader({ name: 'test.txt', size: 100 });
      buf[10] = 255; // corrupt a byte
      assert.throws(() => parseHeader(buf), /Invalid tar header/);
    });
  });

  describe('format detection', () => {
    it('detects USTAR format', () => {
      const buf = createHeader({ name: 'test.txt' });
      assert.strictEqual(isUstar(buf), true);
    });

    it('detects GNU format', () => {
      const buf = createHeader({ name: 'test.txt' });
      buf.write('ustar ', 257, 6, 'utf8');
      buf[263] = 32;
      buf[264] = 0;
      // Recalculate checksum
      for (let i = 148; i < 156; i++) buf[i] = 32;
      writeOctal(buf, 148, 8, checksum(buf));
      assert.strictEqual(isGnu(buf), true);
    });
  });
});
