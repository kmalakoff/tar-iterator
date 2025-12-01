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

import { SPARSE_ENTRIES_IN_HEADER, SPARSE_ENTRY_NUMBYTES_SIZE, SPARSE_ENTRY_OFFSET_SIZE, SPARSE_ENTRY_SIZE, SPARSE_EXTENDED_ENTRIES, SPARSE_EXTENDED_ISEXTENDED_OFFSET, SPARSE_ISEXTENDED_OFFSET, SPARSE_OFFSET, SPARSE_REALSIZE_OFFSET, SPARSE_REALSIZE_SIZE } from './constants.ts';
import EntryStream from './EntryStream.ts';
import { decodeOct } from './headers.ts';

// Reusable zero buffer for sparse hole emission (64KB)
const ZERO_BUFFER_SIZE = 65536;
let zeroBuffer: Buffer | null = null;

function getZeroBuffer(): Buffer {
  if (!zeroBuffer) {
    zeroBuffer = new Buffer(ZERO_BUFFER_SIZE);
    for (let i = 0; i < ZERO_BUFFER_SIZE; i++) {
      zeroBuffer[i] = 0;
    }
  }
  return zeroBuffer;
}

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
 * Parse sparse entries from a buffer starting at given offset
 *
 * @param buf - Buffer containing sparse entries
 * @param startOffset - Offset in buffer where entries begin
 * @param maxEntries - Maximum number of entries to read
 * @returns Array of valid sparse entries (stops at first zero entry)
 */
function parseSparseEntries(buf: Buffer, startOffset: number, maxEntries: number): SparseEntry[] {
  const entries: SparseEntry[] = [];

  for (let i = 0; i < maxEntries; i++) {
    const entryOffset = startOffset + i * SPARSE_ENTRY_SIZE;
    const offset = decodeOct(buf, entryOffset, SPARSE_ENTRY_OFFSET_SIZE);
    const numbytes = decodeOct(buf, entryOffset + SPARSE_ENTRY_OFFSET_SIZE, SPARSE_ENTRY_NUMBYTES_SIZE);

    // Stop at first zero entry (end of sparse map)
    if (offset === 0 && numbytes === 0) {
      break;
    }

    entries.push({ offset, numbytes });
  }

  return entries;
}

/**
 * Parse GNU sparse header information from a tar header block
 *
 * @param headerBuf - The 512-byte tar header buffer
 * @returns Sparse info including real size, entries, and extended flag
 */
export function parseGnuSparseHeader(headerBuf: Buffer): SparseInfo {
  // Parse sparse entries from header (up to 4)
  const entries = parseSparseEntries(headerBuf, SPARSE_OFFSET, SPARSE_ENTRIES_IN_HEADER);

  // Parse isextended flag
  const isExtended = headerBuf[SPARSE_ISEXTENDED_OFFSET] !== 0;

  // Parse real file size
  const realSize = decodeOct(headerBuf, SPARSE_REALSIZE_OFFSET, SPARSE_REALSIZE_SIZE);

  return { realSize, entries, isExtended };
}

/**
 * Parse GNU sparse extended header block
 *
 * @param extBuf - The 512-byte extended sparse header buffer
 * @returns Object with entries and whether more extended blocks follow
 */
export function parseGnuSparseExtended(extBuf: Buffer): { entries: SparseEntry[]; isExtended: boolean } {
  // Parse sparse entries from extended block (up to 21)
  const entries = parseSparseEntries(extBuf, 0, SPARSE_EXTENDED_ENTRIES);

  // Parse isextended flag
  const isExtended = extBuf[SPARSE_EXTENDED_ISEXTENDED_OFFSET] !== 0;

  return { entries, isExtended };
}

/**
 * Calculate total data size from sparse map
 * This is the actual size of data stored in the archive (sum of all numbytes)
 */
export function sparseDataSize(entries: SparseEntry[]): number {
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    total += entries[i].numbytes;
  }
  return total;
}

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
export class SparseStream extends EntryStream {
  private entries: SparseEntry[];
  private realSize: number;
  private currentEntry: number;
  private virtualPosition: number;
  private entryBytesRemaining: number;

  constructor(entries: SparseEntry[], realSize: number) {
    super();
    this.entries = entries;
    this.realSize = realSize;
    this.currentEntry = 0;
    this.virtualPosition = 0;
    this.entryBytesRemaining = entries.length > 0 ? entries[0].numbytes : 0;
  }

  /**
   * Push data from the tar archive (actual sparse data chunk)
   * Overrides EntryStream.push() to reconstruct sparse file with holes.
   */
  push(data: Buffer | null): boolean {
    // Allow null through to signal end
    if (data === null) return super.push(null);
    if (this.ended) return false;

    let dataOffset = 0;
    let result = true;

    while (dataOffset < data.length && this.currentEntry < this.entries.length) {
      const entry = this.entries[this.currentEntry];

      // First, emit zeros for any hole before current entry
      if (this.virtualPosition < entry.offset) {
        const holeSize = entry.offset - this.virtualPosition;
        this._emitZeros(holeSize);
        this.virtualPosition = entry.offset;
      }

      // Now emit actual data for this entry
      const toEmit = Math.min(this.entryBytesRemaining, data.length - dataOffset);
      if (toEmit > 0) {
        const chunk = data.slice(dataOffset, dataOffset + toEmit);
        result = super.push(chunk);
        dataOffset += toEmit;
        this.virtualPosition += toEmit;
        this.entryBytesRemaining -= toEmit;
      }

      // Move to next entry if current is exhausted
      if (this.entryBytesRemaining <= 0) {
        this.currentEntry++;
        if (this.currentEntry < this.entries.length) {
          this.entryBytesRemaining = this.entries[this.currentEntry].numbytes;
        }
      }
    }
    return result;
  }

  /**
   * End the stream - emit any trailing zeros
   * Overrides EntryStream.end() to emit trailing zeros first.
   */
  end(): void {
    if (this.ended) return;

    // Emit remaining zeros to reach real file size
    if (this.virtualPosition < this.realSize) {
      this._emitZeros(this.realSize - this.virtualPosition);
      this.virtualPosition = this.realSize;
    }

    super.end();
  }

  /**
   * Emit zeros for a hole, reusing the shared zero buffer
   */
  private _emitZeros(size: number): void {
    const zeros = getZeroBuffer();
    let remaining = size;

    while (remaining > 0) {
      const toEmit = Math.min(remaining, ZERO_BUFFER_SIZE);
      // Slice from the reusable buffer to emit exact size needed
      super.push(zeros.slice(0, toEmit));
      remaining -= toEmit;
    }
  }
}
