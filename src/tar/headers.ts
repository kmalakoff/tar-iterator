/**
 * TAR Header Parsing
 *
 * All functions use only Node 0.8 compatible Buffer APIs:
 * - Buffer indexing: buf[i]
 * - Buffer.slice(start, end)
 * - Buffer.toString(encoding)
 * - Buffer.write(string, offset, length, encoding)
 * - new Buffer(size) or new Buffer(string)
 *
 * NOT using (added in later Node versions):
 * - Buffer.from()
 * - Buffer.alloc()
 * - Buffer.allocUnsafe()
 * - Buffer.compare()
 * - Number.isNaN() (use global isNaN instead)
 */

import {
  CHECKSUM_OFFSET,
  CHECKSUM_SIZE,
  DEVMAJOR_OFFSET,
  DEVMAJOR_SIZE,
  DEVMINOR_OFFSET,
  DEVMINOR_SIZE,
  GID_OFFSET,
  GID_SIZE,
  GNAME_OFFSET,
  GNAME_SIZE,
  GNU_MAGIC,
  GNU_VER,
  HEADER_SIZE,
  LINKNAME_OFFSET,
  LINKNAME_SIZE,
  MAGIC_OFFSET,
  MODE_OFFSET,
  MODE_SIZE,
  MTIME_OFFSET,
  MTIME_SIZE,
  NAME_OFFSET,
  NAME_SIZE,
  PREFIX_OFFSET,
  PREFIX_SIZE,
  SIZE_OFFSET,
  SIZE_SIZE,
  type TarEntryType,
  TYPE_BLOCK_DEVICE,
  TYPE_CHAR_DEVICE,
  TYPE_CONTIGUOUS,
  TYPE_DIRECTORY,
  TYPE_FIFO,
  TYPE_FILE,
  TYPE_GNU_DUMPDIR,
  TYPE_GNU_LONG_LINK,
  TYPE_GNU_LONG_PATH,
  TYPE_GNU_MULTIVOL,
  TYPE_GNU_SPARSE,
  TYPE_GNU_VOLHDR,
  TYPE_LINK,
  TYPE_PAX_GLOBAL,
  TYPE_PAX_HEADER,
  TYPE_SYMLINK,
  TYPEFLAG_OFFSET,
  UID_OFFSET,
  UID_SIZE,
  UNAME_OFFSET,
  UNAME_SIZE,
  USTAR_MAGIC,
  VERSION_OFFSET,
  ZERO_OFFSET,
} from './constants.ts';
import { createTarError, TarErrorCode } from './errors.ts';

export interface TarHeader {
  name: string;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  mtime: Date;
  type: TarEntryType;
  linkname: string | null;
  uname: string;
  gname: string;
  devmajor: number;
  devminor: number;
  pax: Record<string, string> | null;
}

export interface ParseOptions {
  filenameEncoding?: BufferEncoding;
  allowUnknownFormat?: boolean;
}

/**
 * Convert type flag number to type string
 */
export function toType(flag: number): TarEntryType {
  switch (flag) {
    case TYPE_FILE:
      return 'file';
    case TYPE_LINK:
      return 'link';
    case TYPE_SYMLINK:
      return 'symlink';
    case TYPE_CHAR_DEVICE:
      return 'character-device';
    case TYPE_BLOCK_DEVICE:
      return 'block-device';
    case TYPE_DIRECTORY:
      return 'directory';
    case TYPE_FIFO:
      return 'fifo';
    case TYPE_CONTIGUOUS:
      return 'contiguous-file';
    case TYPE_GNU_LONG_PATH:
      return 'gnu-long-path';
    case TYPE_GNU_LONG_LINK:
      return 'gnu-long-link-path';
    case TYPE_GNU_SPARSE:
      return 'gnu-sparse';
    case TYPE_GNU_DUMPDIR:
      return 'gnu-dumpdir';
    case TYPE_GNU_MULTIVOL:
      return 'gnu-multivol';
    case TYPE_GNU_VOLHDR:
      return 'gnu-volume-header';
    case TYPE_PAX_HEADER:
      return 'pax-header';
    case TYPE_PAX_GLOBAL:
      return 'pax-global-header';
    default:
      return null;
  }
}

/**
 * Node 0.8 compatible isNaN (Number.isNaN didn't exist until ES2015)
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: Legacy
function isNaN(value: number): boolean {
  // biome-ignore lint/suspicious/noSelfCompare: Legacy
  return value !== value;
}

/**
 * Find null terminator in buffer region
 */
function findNull(buf: Buffer, start: number, end: number): number {
  for (let i = start; i < end; i++) {
    if (buf[i] === 0) return i;
  }
  return end;
}

/**
 * Decode null-terminated string from buffer
 */
function decodeStr(buf: Buffer, offset: number, length: number, encoding?: BufferEncoding): string {
  const enc: BufferEncoding = encoding || 'utf8';
  const end = findNull(buf, offset, offset + length);
  return buf.slice(offset, end).toString(enc);
}

/**
 * Parse base-256 encoded number (GNU extension for large files >8GB)
 * If high bit of first byte is set, remaining bytes are big-endian base-256
 */
function parse256(buf: Buffer): number {
  // Check sign bit (bit 6 of first byte, after the marker bit 7)
  const positive = (buf[0] & 0x40) === 0;

  // Build number from bytes (big-endian, excluding first byte's marker bits)
  let sum = 0;
  let base = 1;

  // Process bytes from right to left (least significant first)
  for (let i = buf.length - 1; i > 0; i--) {
    const byte = buf[i];
    if (positive) {
      sum += byte * base;
    } else {
      sum += (0xff - byte) * base;
    }
    base *= 256;
  }

  return positive ? sum : -1 * sum;
}

/**
 * Decode octal number from buffer, with base-256 fallback for large values
 */
export function decodeOct(buf: Buffer, offset: number, length: number): number {
  const val = buf.slice(offset, offset + length);

  // If high bit is set, parse as base-256 (GNU extension)
  if (val[0] & 0x80) {
    return parse256(val);
  }

  // Skip leading spaces (some old tar versions use them)
  let start = 0;
  while (start < val.length && val[start] === 32) start++;

  // Find end (space or null terminator)
  let end = start;
  while (end < val.length && val[end] !== 32 && val[end] !== 0) end++;

  // Skip leading zeros
  while (start < end && val[start] === ZERO_OFFSET) start++;

  if (start === end) return 0;

  return parseInt(val.slice(start, end).toString(), 8);
}

/**
 * Calculate checksum of header block
 * Per POSIX: sum of all bytes, treating checksum field as spaces (0x20)
 */
export function checksum(buf: Buffer): number {
  let sum = 0;
  for (let i = 0; i < HEADER_SIZE; i++) {
    // Treat checksum field (offset 148, length 8) as spaces
    if (i >= CHECKSUM_OFFSET && i < CHECKSUM_OFFSET + CHECKSUM_SIZE) {
      sum += 32; // space character
    } else {
      sum += buf[i];
    }
  }
  return sum;
}

/**
 * Compare buffer region to byte array
 * Replacement for Buffer.compare that works on Node 0.8+
 */
function bufferEquals(buf: Buffer, offset: number, expected: number[]): boolean {
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) return false;
  }
  return true;
}

/**
 * Check if buffer contains USTAR magic
 */
export function isUstar(buf: Buffer): boolean {
  return bufferEquals(buf, MAGIC_OFFSET, USTAR_MAGIC);
}

/**
 * Check if buffer contains GNU tar magic
 */
export function isGnu(buf: Buffer): boolean {
  return bufferEquals(buf, MAGIC_OFFSET, GNU_MAGIC) && bufferEquals(buf, VERSION_OFFSET, GNU_VER);
}

/**
 * Parse a 512-byte TAR header
 *
 * @param buf - 512-byte header buffer
 * @param opts - Parse options
 * @returns Parsed header or null if empty block (end of archive)
 */
export function parseHeader(buf: Buffer, opts?: ParseOptions): TarHeader | null {
  const options = opts || {};
  const filenameEncoding = options.filenameEncoding || 'utf8';
  const allowUnknownFormat = options.allowUnknownFormat || false;

  // Get type flag (handle null as 0 for old tar compatibility)
  // Standard POSIX types are '0'-'7' (ASCII 48-55), subtract ZERO_OFFSET to get 0-7
  // GNU/PAX extension types are letters ('L'=76, 'K'=75, 'x'=120, 'g'=103), use raw ASCII value
  const rawTypeflag = buf[TYPEFLAG_OFFSET];
  let typeflag: number;
  if (rawTypeflag === 0) {
    typeflag = 0; // Null byte treated as regular file
  } else if (rawTypeflag >= ZERO_OFFSET && rawTypeflag <= ZERO_OFFSET + 7) {
    // Standard POSIX type '0'-'7'
    typeflag = rawTypeflag - ZERO_OFFSET;
  } else {
    // GNU/PAX extension type - use raw ASCII value
    typeflag = rawTypeflag;
  }

  // Decode basic fields
  let name = decodeStr(buf, NAME_OFFSET, NAME_SIZE, filenameEncoding);
  const mode = decodeOct(buf, MODE_OFFSET, MODE_SIZE);
  const uid = decodeOct(buf, UID_OFFSET, UID_SIZE);
  const gid = decodeOct(buf, GID_OFFSET, GID_SIZE);
  const size = decodeOct(buf, SIZE_OFFSET, SIZE_SIZE);
  const mtime = decodeOct(buf, MTIME_OFFSET, MTIME_SIZE);
  const type = toType(typeflag);
  const linkname = buf[LINKNAME_OFFSET] === 0 ? null : decodeStr(buf, LINKNAME_OFFSET, LINKNAME_SIZE, filenameEncoding);
  const uname = decodeStr(buf, UNAME_OFFSET, UNAME_SIZE);
  const gname = decodeStr(buf, GNAME_OFFSET, GNAME_SIZE);
  const devmajor = decodeOct(buf, DEVMAJOR_OFFSET, DEVMAJOR_SIZE);
  const devminor = decodeOct(buf, DEVMINOR_OFFSET, DEVMINOR_SIZE);

  // Calculate and validate checksum
  const computed = checksum(buf);

  // Empty block check: checksum of all zeros treated as spaces = 8 * 32 = 256
  if (computed === 8 * 32) return null;

  // Validate stored checksum
  const stored = decodeOct(buf, CHECKSUM_OFFSET, CHECKSUM_SIZE);
  if (computed !== stored) {
    throw createTarError('Invalid tar header. Maybe the tar is corrupted or it needs to be gunzipped?', TarErrorCode.INVALID_CHECKSUM);
  }

  // Handle USTAR format (prepend prefix to name if present)
  if (isUstar(buf)) {
    if (buf[PREFIX_OFFSET] !== 0) {
      name = `${decodeStr(buf, PREFIX_OFFSET, PREFIX_SIZE, filenameEncoding)}/${name}`;
    }
  } else if (isGnu(buf)) {
    // GNU format - magic is validated, no additional processing needed
  } else {
    if (!allowUnknownFormat) {
      throw createTarError('Invalid tar header: unknown format.', TarErrorCode.INVALID_FORMAT);
    }
  }

  // NOTE: Old tar versions use trailing / to indicate directories.
  // This check is intentionally NOT done here because GNU long path
  // extensions may change the name. The check is done in TarExtract._applyExtensions()
  // after the full name is resolved.

  return {
    name,
    mode,
    uid,
    gid,
    size,
    mtime: new Date(1000 * mtime),
    type,
    linkname,
    uname,
    gname,
    devmajor,
    devminor,
    pax: null,
  };
}

/**
 * Decode PAX extended attributes
 * Format: "length key=value\n" repeated
 * Length includes the entire record (length field + space + key=value + newline)
 */
export function decodePax(buf: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 0;

  while (pos < buf.length) {
    // Find space after length
    let spacePos = pos;
    while (spacePos < buf.length && buf[spacePos] !== 32) spacePos++;

    // Parse length
    const len = parseInt(buf.slice(pos, spacePos).toString(), 10);
    if (!len || isNaN(len)) break;

    // Extract key=value (after space, before newline)
    // Record spans from spacePos+1 to pos+len-1 (excluding newline)
    const record = buf.slice(spacePos + 1, pos + len - 1).toString('utf8');
    const eqPos = record.indexOf('=');
    if (eqPos === -1) break;

    const key = record.slice(0, eqPos);
    const value = record.slice(eqPos + 1);
    result[key] = value;

    pos += len;
  }

  return result;
}

/**
 * Decode GNU long path/linkname
 * The content is null-terminated string
 */
export function decodeLongPath(buf: Buffer, encoding?: BufferEncoding): string {
  return decodeStr(buf, 0, buf.length, encoding);
}

/**
 * Calculate number of padding bytes to reach 512-byte block alignment
 */
export function overflow(size: number): number {
  const remainder = size & 511; // size % 512
  return remainder ? 512 - remainder : 0;
}
