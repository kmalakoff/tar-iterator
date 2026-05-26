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
import { type TarEntryType } from './constants.ts';
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
export declare function toType(flag: number): TarEntryType;
/**
 * Decode octal number from buffer, with base-256 fallback for large values
 */
export declare function decodeOct(buf: Buffer, offset: number, length: number): number;
/**
 * Calculate checksum of header block
 * Per POSIX: sum of all bytes, treating checksum field as spaces (0x20)
 */
export declare function checksum(buf: Buffer): number;
/**
 * Check if buffer contains USTAR magic
 */
export declare function isUstar(buf: Buffer): boolean;
/**
 * Check if buffer contains GNU tar magic
 */
export declare function isGnu(buf: Buffer): boolean;
/**
 * Parse a 512-byte TAR header
 *
 * @param buf - 512-byte header buffer
 * @param opts - Parse options
 * @returns Parsed header or null if empty block (end of archive)
 */
export declare function parseHeader(buf: Buffer, opts?: ParseOptions): TarHeader | null;
/**
 * Decode PAX extended attributes
 * Format: "length key=value\n" repeated
 * Length includes the entire record (length field + space + key=value + newline)
 */
export declare function decodePax(buf: Buffer): Record<string, string>;
/**
 * Decode GNU long path/linkname
 * The content is null-terminated string
 */
export declare function decodeLongPath(buf: Buffer, encoding?: BufferEncoding): string;
/**
 * Calculate number of padding bytes to reach 512-byte block alignment
 */
export declare function overflow(size: number): number;
