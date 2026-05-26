/**
 * Extensions - GNU/PAX extension handling for TAR
 *
 * Manages state and decoding for:
 * - GNU LongPath (type 'L') - paths > 100 chars
 * - GNU LongLink (type 'K') - symlink targets > 100 chars
 * - PAX Headers (type 'x') - extended attributes per-entry
 * - PAX Global Headers (type 'g') - extended attributes for all entries
 */
import { type TarHeader } from './headers.ts';
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
export declare function createExtensionState(): ExtensionState;
/**
 * Finalize extension data and update state
 *
 * @param state Extension state to update
 * @param currentState Parser state (STATE_GNU_LONG_PATH, etc.)
 * @param header Current header (for PAX global detection)
 * @param encoding Filename encoding
 */
export declare function finalizeExtension(
  state: ExtensionState,
  currentState: number,
  header: {
    type: string;
  } | null,
  encoding: BufferEncoding
): void;
/**
 * Apply pending GNU/PAX extensions to a header
 *
 * @param header Header to modify
 * @param state Extension state (will be partially cleared)
 */
export declare function applyExtensions(header: TarHeader, state: ExtensionState): void;
/**
 * Apply PAX attributes to header
 */
export declare function applyPaxToHeader(header: TarHeader, pax: Record<string, string>): void;
/**
 * Concatenate buffers (Node 0.8 compatible)
 */
export declare function concatBuffers(buffers: Buffer[]): Buffer;
