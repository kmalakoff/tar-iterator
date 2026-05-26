/**
 * GNU Sparse File Support
 *
 * Handles parsing of GNU sparse file headers and stream reconstruction.
 *
 * GNU sparse format stores:
 * 1. A sparse map in the header (offset 386) with up to 4 entries
 * 2. Extended sparse headers (512-byte blocks) if more entries needed
 * 3. The actual data chunks (only non-zero portions of the file)
 *
 * Each sparse entry contains:
 * - offset: position in the virtual file where this data chunk belongs
 * - numbytes: size of this data chunk
 *
 * Node 0.8 compatible - uses only basic Buffer operations.
 */
import EntryStream from './EntryStream.ts';
/**
 * Represents a region of actual data in a sparse file
 */
export interface SparseEntry {
  /** Offset in the reconstructed (virtual) file */
  offset: number;
  /** Number of bytes of actual data */
  numbytes: number;
}
/**
 * Parsed sparse header information
 */
export interface SparseInfo {
  /** The actual (reconstructed) file size */
  realSize: number;
  /** Sparse map entries */
  entries: SparseEntry[];
  /** Whether there are more entries in extended headers */
  isExtended: boolean;
}
/**
 * Parse GNU sparse header information from a tar header block
 *
 * @param headerBuf - The 512-byte tar header buffer
 * @returns Sparse info including real size, entries, and extended flag
 */
export declare function parseGnuSparseHeader(headerBuf: Buffer): SparseInfo;
/**
 * Parse GNU sparse extended header block
 *
 * @param extBuf - The 512-byte extended sparse header buffer
 * @returns Object with entries and whether more extended blocks follow
 */
export declare function parseGnuSparseExtended(extBuf: Buffer): {
  entries: SparseEntry[];
  isExtended: boolean;
};
/**
 * Calculate total data size from sparse map
 * This is the actual size of data stored in the archive (sum of all numbytes)
 */
export declare function sparseDataSize(entries: SparseEntry[]): number;
/**
 * Stream that reconstructs a sparse file from data chunks
 *
 * Takes the sparse map and actual data, outputs reconstructed file
 * with zeros inserted for holes.
 *
 * Extends EntryStream to inherit pause/resume/pipe behavior.
 *
 * @internal
 */
export declare class SparseStream extends EntryStream {
  private entries;
  private realSize;
  private currentEntry;
  private virtualPosition;
  private entryBytesRemaining;
  constructor(entries: SparseEntry[], realSize: number);
  /**
   * Push data from the tar archive (actual sparse data chunk)
   * Overrides EntryStream.push() to reconstruct sparse file with holes.
   */
  push(data: Buffer | null): boolean;
  /**
   * End the stream - emit any trailing zeros
   * Overrides EntryStream.end() to emit trailing zeros first.
   */
  end(): void;
  /**
   * Emit zeros for a hole, reusing the shared zero buffer
   */
  private _emitZeros;
}
