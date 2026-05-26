/**
 * TarExtract - Streaming TAR extraction
 *
 * Event-based TAR parser that emits 'entry' events for each file.
 * Node 0.8 compatible.
 *
 * State Machine:
 * ```
 *                          ┌─────────────────────────────────────────────┐
 *                          │                                             │
 *  HEADER ─┬─ [file] ────> FILE_DATA ──> PADDING ─────────────────────>──┤
 *          │                                                             │
 *          ├─ [gnu-long-path] ──> GNU_LONG_PATH ──> PADDING ──>──────────┤
 *          │                                                             │
 *          ├─ [gnu-long-link] ──> GNU_LONG_LINK ──> PADDING ──>──────────┤
 *          │                                                             │
 *          ├─ [pax-header] ──> PAX_HEADER ──> PADDING ──>────────────────┤
 *          │                                                             │
 *          ├─ [gnu-sparse] ─┬─> SPARSE_EXTENDED ──> SPARSE_DATA ──>──────┤
 *          │                │                                            │
 *          │                └─> SPARSE_DATA ──> PADDING ──>──────────────┤
 *          │                                                             │
 *          └─ [null header] ──> END                                      │
 *                                                                        │
 *          <─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Extension handling:
 * - GNU LongPath/LongLink headers store path for NEXT entry
 * - PAX headers store attributes for NEXT entry (or all entries if global)
 * - Extensions are applied when the actual file header is processed
 *
 * Events:
 *   'entry' (header: TarHeader, stream: Readable, next: () => void)
 *   'error' (err: Error)
 *   'finish' ()
 */
import { EventEmitter } from 'events';
import { type ParseOptions } from './headers.ts';
export interface TarExtractOptions extends ParseOptions {}
/**
 * TAR extraction stream
 *
 * Usage:
 *   const extract = new TarExtract();
 *   extract.on('entry', (header, stream, next) => { ... });
 *   extract.on('error', (err) => { ... });
 *   extract.on('finish', () => { ... });
 *   source.on('data', (chunk) => extract.write(chunk));
 *   source.on('end', () => extract.end());
 *
 * @internal
 * @hidden
 */
export default class TarExtract extends EventEmitter {
  private buffer;
  private state;
  private options;
  private header;
  private entryStream;
  private entryRemaining;
  private paddingRemaining;
  private locked;
  private pending;
  private finished;
  private finishEmitted;
  private pendingEntry;
  private extState;
  private sparseInfo;
  private sparseStream;
  private sparseDataRemaining;
  constructor(options?: TarExtractOptions);
  /**
   * Write data to the parser
   */
  write(chunk: Buffer, callback?: () => void): boolean;
  /**
   * Signal end of input
   */
  end(callback?: () => void): void;
  /**
   * Emit error to the main stream and any active entry stream
   * This prevents tests from hanging when errors occur mid-extraction
   */
  private _emitError;
  /**
   * Emit 'finish' if appropriate
   */
  private _maybeFinish;
  /**
   * Resume parsing - emit any pending entry
   * Call this after setting up 'entry' listeners
   */
  resume(): void;
  /**
   * Process buffered data through state machine
   */
  private _process;
  /**
   * Process header state
   */
  private _processHeader;
  /**
   * Process extension data (GNU long path/link, PAX headers)
   */
  private _processExtensionData;
  /**
   * Process file data state
   */
  private _processFileData;
  /**
   * Process padding state
   */
  private _processPadding;
  /**
   * Unlock parser (called by next() callback)
   */
  private _unlock;
  /**
   * Set up a sparse entry with SparseStream
   */
  private _setupSparseEntry;
  /**
   * Process extended sparse headers
   */
  private _processSparseExtended;
  /**
   * Process sparse file data
   */
  private _processSparseData;
}
