/**
 * Extensions - GNU/PAX extension handling for TAR
 *
 * Manages state and decoding for:
 * - GNU LongPath (type 'L') - paths > 100 chars
 * - GNU LongLink (type 'K') - symlink targets > 100 chars
 * - PAX Headers (type 'x') - extended attributes per-entry
 * - PAX Global Headers (type 'g') - extended attributes for all entries
 */

import { allocBufferUnsafe } from 'extract-base-iterator';
import { decodeLongPath, decodePax, type TarHeader } from './headers.ts';

/**
 * Extension state for accumulating extension data across chunks
 */
export interface ExtensionState {
  /** GNU long path for next entry */
  gnuLongPath: string | null;
  /** GNU long link (symlink target) for next entry */
  gnuLongLink: string | null;
  /** PAX header for next entry */
  paxHeader: Record<string, string> | null;
  /** PAX global headers (apply to all subsequent entries) */
  paxGlobal: Record<string, string>;
  /** Accumulated extension data chunks */
  extensionData: Buffer[];
  /** Bytes remaining to read for current extension */
  extensionRemaining: number;
}

/**
 * Create a fresh extension state
 */
export function createExtensionState(): ExtensionState {
  return {
    gnuLongPath: null,
    gnuLongLink: null,
    paxHeader: null,
    paxGlobal: {},
    extensionData: [],
    extensionRemaining: 0,
  };
}

/**
 * Finalize extension data and update state
 *
 * @param state Extension state to update
 * @param currentState Parser state (STATE_GNU_LONG_PATH, etc.)
 * @param header Current header (for PAX global detection)
 * @param encoding Filename encoding
 */
export function finalizeExtension(state: ExtensionState, currentState: number, header: { type: string } | null, encoding: BufferEncoding): void {
  // Import state constants
  const STATE_GNU_LONG_PATH = 4;
  const STATE_GNU_LONG_LINK = 5;
  const STATE_PAX_HEADER = 6;

  // Concatenate all collected data
  const combined = concatBuffers(state.extensionData);
  state.extensionData = [];

  switch (currentState) {
    case STATE_GNU_LONG_PATH:
      state.gnuLongPath = decodeLongPath(combined, encoding);
      break;
    case STATE_GNU_LONG_LINK:
      state.gnuLongLink = decodeLongPath(combined, encoding);
      break;
    case STATE_PAX_HEADER:
      // Check if this was a global header
      if (header && header.type === 'pax-global-header') {
        const global = decodePax(combined);
        // Merge into global (don't replace, merge)
        for (const key in global) {
          // biome-ignore lint/suspicious/noPrototypeBuiltins: ES2021 compatibility
          if (global.hasOwnProperty(key)) {
            state.paxGlobal[key] = global[key];
          }
        }
      } else {
        state.paxHeader = decodePax(combined);
      }
      break;
  }
}

/**
 * Apply pending GNU/PAX extensions to a header
 *
 * @param header Header to modify
 * @param state Extension state (will be partially cleared)
 */
export function applyExtensions(header: TarHeader, state: ExtensionState): void {
  // Apply PAX global header first
  if (state.paxGlobal) {
    applyPaxToHeader(header, state.paxGlobal);
  }

  // Apply PAX header (per-entry, overrides global)
  if (state.paxHeader) {
    applyPaxToHeader(header, state.paxHeader);
    header.pax = state.paxHeader;
    state.paxHeader = null;
  }

  // Apply GNU long path (overrides PAX path)
  if (state.gnuLongPath !== null) {
    header.name = state.gnuLongPath;
    state.gnuLongPath = null;
  }

  // Apply GNU long link (overrides PAX linkpath)
  if (state.gnuLongLink !== null) {
    header.linkname = state.gnuLongLink;
    state.gnuLongLink = null;
  }

  // Handle old tar versions that use trailing / to indicate directories
  // This check is done AFTER extensions are applied so we use the final
  // resolved name (GNU long path or PAX path), not the truncated name field.
  if (header.type === 'file' && header.name && header.name[header.name.length - 1] === '/') {
    header.type = 'directory';
  }
}

/**
 * Apply PAX attributes to header
 */
export function applyPaxToHeader(header: TarHeader, pax: Record<string, string>): void {
  if (pax.path) header.name = pax.path;
  if (pax.linkpath) header.linkname = pax.linkpath;
  if (pax.size) header.size = parseInt(pax.size, 10);
  if (pax.uid) header.uid = parseInt(pax.uid, 10);
  if (pax.gid) header.gid = parseInt(pax.gid, 10);
  if (pax.uname) header.uname = pax.uname;
  if (pax.gname) header.gname = pax.gname;
  if (pax.mtime) header.mtime = new Date(parseFloat(pax.mtime) * 1000);
}

/**
 * Concatenate buffers (Node 0.8 compatible)
 */
export function concatBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc ? Buffer.alloc(0) : new Buffer(0);
  if (buffers.length === 1) return buffers[0];

  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);

  if (Buffer.concat) {
    return Buffer.concat(buffers, totalLength);
  }

  // Node 0.8 fallback
  const result = allocBufferUnsafe(totalLength);
  let offset = 0;
  for (let i = 0; i < buffers.length; i++) {
    buffers[i].copy(result, offset);
    offset += buffers[i].length;
  }
  return result;
}
