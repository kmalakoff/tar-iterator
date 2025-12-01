/**
 * TarExtract - Streaming TAR extraction
 *
 * Event-based TAR parser that emits 'entry' events for each file.
 * Node 0.8 compatible.
 *
 * State Machine (Phase 1 MVP):
 * HEADER -> FILE_DATA -> PADDING -> HEADER
 */

import { EventEmitter } from 'events';
import BufferList from './BufferList.ts';
import { BLOCK_SIZE, HEADER_SIZE } from './constants.ts';
import EntryStream from './EntryStream.ts';
import { decodeLongPath, decodePax, overflow, type ParseOptions, parseHeader, type TarHeader } from './headers.ts';
import { parseGnuSparseExtended, parseGnuSparseHeader, type SparseInfo, SparseStream, sparseDataSize } from './sparse.ts';

// Parser states
const STATE_HEADER = 0;
const STATE_FILE_DATA = 1;
const STATE_PADDING = 2;
const STATE_END = 3;
const STATE_GNU_LONG_PATH = 4;
const STATE_GNU_LONG_LINK = 5;
const STATE_PAX_HEADER = 6;
const STATE_SPARSE_EXTENDED = 7;
const STATE_SPARSE_DATA = 8;

export interface TarExtractOptions extends ParseOptions {
  // Options from ParseOptions: filenameEncoding, allowUnknownFormat
}

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
  private buffer: BufferList;
  private state: number;
  private options: TarExtractOptions;

  // Current entry state
  private header: TarHeader | null = null;
  private entryStream: EntryStream | null = null;
  private entryRemaining = 0;
  private paddingRemaining = 0;

  // Backpressure control
  private locked = false;
  private pending = false;
  private finished = false;
  private finishEmitted = false;

  // Pending entry to emit (waiting for consumer to set up listeners)
  private pendingEntry: { header: TarHeader; stream: EntryStream; next: () => void } | null = null;

  // GNU/PAX extension data for next entry
  private gnuLongPath: string | null = null;
  private gnuLongLink: string | null = null;
  private paxHeader: Record<string, string> | null = null;
  private paxGlobal: Record<string, string> = {};
  private extensionData: Buffer[] = [];
  private extensionRemaining = 0;

  // GNU sparse file state
  private sparseInfo: SparseInfo | null = null;
  private sparseStream: SparseStream | null = null;
  private sparseDataRemaining = 0;

  constructor(options?: TarExtractOptions) {
    super();
    this.buffer = new BufferList();
    this.state = STATE_HEADER;
    this.options = options || {};
  }

  /**
   * Write data to the parser
   */
  write(chunk: Buffer, callback?: () => void): boolean {
    if (this.finished) {
      if (callback) callback();
      return false;
    }

    this.buffer.append(chunk);
    this._process();

    // Emit any pending entry that was parsed during _process()
    // This is necessary because _process() may parse new entry headers
    // from incoming data, and those entries need to be emitted to listeners
    this.resume();

    if (callback) callback();
    return !this.locked;
  }

  /**
   * Signal end of input
   */
  end(callback?: () => void): void {
    this.finished = true;
    this._process();
    // Emit any pending entry before checking for finish
    this.resume();
    this._maybeFinish();
    if (callback) callback();
  }

  /**
   * Emit error to the main stream and any active entry stream
   * This prevents tests from hanging when errors occur mid-extraction
   */
  private _emitError(err: Error): void {
    // Propagate error to any active entry stream first
    const activeStream = this.entryStream || this.sparseStream;
    if (activeStream && !activeStream.ended) {
      activeStream.emit('error', err);
    }
    // Then emit to the main extract stream
    this.emit('error', err);
  }

  /**
   * Emit 'finish' if appropriate
   */
  private _maybeFinish(): void {
    // Don't emit finish more than once
    if (this.finishEmitted) return;
    // Don't emit finish if we have a pending entry
    if (this.pendingEntry) return;
    // Don't emit finish if not finished yet
    if (!this.finished) return;
    // Don't emit finish if locked - consumer hasn't called next() yet
    // and there may be more entries to process
    if (this.locked) return;
    // Only emit finish when we're in a terminal state
    if (this.state === STATE_HEADER || this.state === STATE_END) {
      this.state = STATE_END; // Mark as ended
      this.finishEmitted = true;
      this.emit('finish');
    }
  }

  /**
   * Resume parsing - emit any pending entry
   * Call this after setting up 'entry' listeners
   */
  resume(): void {
    // Only emit if there are listeners - this prevents entries from being
    // lost when resume() is called from write() before listeners are set up
    // Use listeners().length for Node 0.8 compatibility (listenerCount added in 0.10)
    if (this.pendingEntry && this.listeners('entry').length > 0) {
      const entry = this.pendingEntry;
      this.pendingEntry = null;

      // Clear pending flag so file data can flow
      this.pending = false;

      // Emit the entry
      this.emit('entry', entry.header, entry.stream, entry.next);

      // Continue processing file data
      this._process();

      // Check if we should emit finish now
      this._maybeFinish();
    }
  }

  /**
   * Process buffered data through state machine
   */
  private _process(): void {
    // Note: locked/pending only blocks processing NEXT header, not current entry data
    if (this.pending) return;

    let cont = true;
    while (cont) {
      switch (this.state) {
        case STATE_HEADER:
          // Don't process new headers while locked
          if (this.locked) {
            cont = false;
          } else {
            cont = this._processHeader();
          }
          break;
        case STATE_FILE_DATA:
          cont = this._processFileData();
          break;
        case STATE_PADDING:
          cont = this._processPadding();
          break;
        case STATE_GNU_LONG_PATH:
        case STATE_GNU_LONG_LINK:
        case STATE_PAX_HEADER:
          cont = this._processExtensionData();
          break;
        case STATE_SPARSE_EXTENDED:
          cont = this._processSparseExtended();
          break;
        case STATE_SPARSE_DATA:
          cont = this._processSparseData();
          break;
        case STATE_END:
          cont = false;
          break;
        default:
          cont = false;
      }
    }
  }

  /**
   * Process header state
   */
  private _processHeader(): boolean {
    if (!this.buffer.has(HEADER_SIZE)) {
      return false; // Need more data
    }

    const headerBuf = this.buffer.consume(HEADER_SIZE);

    // Try to parse header
    let header: TarHeader | null;
    try {
      header = parseHeader(headerBuf, this.options);
    } catch (err) {
      this._emitError(err as Error);
      this.state = STATE_END;
      return false;
    }

    // Null header means end of archive (empty block)
    if (header === null) {
      this.state = STATE_END;
      this.emit('finish');
      return false;
    }

    this.header = header;
    this.paddingRemaining = overflow(header.size);

    // Handle GNU/PAX extension headers - collect data silently
    if (header.type === 'gnu-long-path') {
      this.extensionRemaining = header.size;
      this.extensionData = [];
      this.state = STATE_GNU_LONG_PATH;
      return true; // Continue processing
    }

    if (header.type === 'gnu-long-link-path') {
      this.extensionRemaining = header.size;
      this.extensionData = [];
      this.state = STATE_GNU_LONG_LINK;
      return true; // Continue processing
    }

    if (header.type === 'pax-header') {
      this.extensionRemaining = header.size;
      this.extensionData = [];
      this.state = STATE_PAX_HEADER;
      return true; // Continue processing
    }

    if (header.type === 'pax-global-header') {
      // For global headers, we read them but they apply to all subsequent entries
      this.extensionRemaining = header.size;
      this.extensionData = [];
      this.state = STATE_PAX_HEADER; // Same handling, different application
      return true; // Continue processing
    }

    // Handle GNU sparse files
    if (header.type === 'gnu-sparse') {
      // Parse sparse info from header
      this.sparseInfo = parseGnuSparseHeader(headerBuf);

      // Apply extensions (e.g., GNU long path)
      this._applyExtensions(header);

      // Update header size to real (reconstructed) file size
      header.size = this.sparseInfo.realSize;

      // If extended sparse headers follow, read them first
      if (this.sparseInfo.isExtended) {
        this.header = header;
        this.state = STATE_SPARSE_EXTENDED;
        return true; // Continue processing
      }

      // No extended headers - set up sparse entry now
      return this._setupSparseEntry(header);
    }

    // Apply any pending GNU/PAX extensions to this entry
    this._applyExtensions(header);

    // Set up for file data
    this.entryRemaining = header.size;

    // Create entry stream
    this.entryStream = new EntryStream();

    // Lock until consumer calls next()
    this.locked = true;
    this.pending = true;

    // Store pending entry (will be emitted when consumer calls resume())
    const self = this;
    const entryStream = this.entryStream;
    const next = function next(): void {
      self._unlock();
    };

    this.pendingEntry = { header, stream: entryStream, next };

    // If no data, go straight to padding
    if (this.entryRemaining === 0) {
      this.entryStream.end();
      this.entryStream = null;
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
    } else {
      this.state = STATE_FILE_DATA;
    }

    return false; // Don't continue processing until unlocked
  }

  /**
   * Apply pending GNU/PAX extensions to a header
   */
  private _applyExtensions(header: TarHeader): void {
    // Apply PAX global header first
    if (this.paxGlobal) {
      this._applyPaxToHeader(header, this.paxGlobal);
    }

    // Apply PAX header (per-entry, overrides global)
    if (this.paxHeader) {
      this._applyPaxToHeader(header, this.paxHeader);
      header.pax = this.paxHeader;
      this.paxHeader = null;
    }

    // Apply GNU long path (overrides PAX path)
    if (this.gnuLongPath !== null) {
      header.name = this.gnuLongPath;
      this.gnuLongPath = null;
    }

    // Apply GNU long link (overrides PAX linkpath)
    if (this.gnuLongLink !== null) {
      header.linkname = this.gnuLongLink;
      this.gnuLongLink = null;
    }
  }

  /**
   * Apply PAX attributes to header
   */
  private _applyPaxToHeader(header: TarHeader, pax: Record<string, string>): void {
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
   * Process extension data (GNU long path/link, PAX headers)
   */
  private _processExtensionData(): boolean {
    if (this.extensionRemaining <= 0) {
      // Done collecting extension data - decode and store
      this._finalizeExtension();
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
      return true;
    }

    if (this.buffer.length === 0) {
      return false; // Need more data
    }

    // Read as much as we can
    const toRead = Math.min(this.extensionRemaining, this.buffer.length);
    const data = this.buffer.consume(toRead);
    this.extensionRemaining -= toRead;
    this.extensionData.push(data);

    // Check if done
    if (this.extensionRemaining <= 0) {
      this._finalizeExtension();
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
    }

    return true;
  }

  /**
   * Finalize extension data collection
   */
  private _finalizeExtension(): void {
    // Concatenate all collected data
    const totalLength = this.extensionData.reduce((sum, buf) => sum + buf.length, 0);
    const combined = Buffer.concat ? Buffer.concat(this.extensionData, totalLength) : this._concatBuffers(this.extensionData, totalLength);
    this.extensionData = [];

    const encoding = this.options.filenameEncoding || 'utf8';

    switch (this.state) {
      case STATE_GNU_LONG_PATH:
        this.gnuLongPath = decodeLongPath(combined, encoding);
        break;
      case STATE_GNU_LONG_LINK:
        this.gnuLongLink = decodeLongPath(combined, encoding);
        break;
      case STATE_PAX_HEADER:
        // Check if this was a global header
        if (this.header && this.header.type === 'pax-global-header') {
          const global = decodePax(combined);
          // Merge into global (don't replace, merge)
          for (const key in global) {
            // biome-ignore lint/suspicious/noPrototypeBuiltins: ES2021 compatibility
            if (global.hasOwnProperty(key)) {
              this.paxGlobal[key] = global[key];
            }
          }
        } else {
          this.paxHeader = decodePax(combined);
        }
        break;
    }
  }

  /**
   * Concatenate buffers (Node 0.8 compatible fallback)
   */
  private _concatBuffers(buffers: Buffer[], totalLength: number): Buffer {
    const result = new Buffer(totalLength);
    let offset = 0;
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];
      buf.copy(result, offset);
      offset += buf.length;
    }
    return result;
  }

  /**
   * Process file data state
   */
  private _processFileData(): boolean {
    if (this.entryRemaining <= 0) {
      // Done with file data
      if (this.entryStream) {
        this.entryStream.end();
        this.entryStream = null;
      }
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
      return true;
    }

    if (this.buffer.length === 0) {
      return false; // Need more data
    }

    // Read as much as we can
    const toRead = Math.min(this.entryRemaining, this.buffer.length);
    const data = this.buffer.consume(toRead);
    this.entryRemaining -= toRead;

    // Push to entry stream
    if (this.entryStream) {
      this.entryStream.push(data);
    }

    // Check if done
    if (this.entryRemaining <= 0) {
      if (this.entryStream) {
        this.entryStream.end();
        this.entryStream = null;
      }
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
    }

    return true;
  }

  /**
   * Process padding state
   */
  private _processPadding(): boolean {
    if (this.paddingRemaining <= 0) {
      this.state = STATE_HEADER;
      return true;
    }

    if (this.buffer.length === 0) {
      return false; // Need more data
    }

    // Skip padding bytes
    const toSkip = Math.min(this.paddingRemaining, this.buffer.length);
    this.buffer.consume(toSkip);
    this.paddingRemaining -= toSkip;

    if (this.paddingRemaining <= 0) {
      this.state = STATE_HEADER;
    }

    return true;
  }

  /**
   * Unlock parser (called by next() callback)
   */
  private _unlock(): void {
    this.locked = false;
    this.pending = false;
    this._process();
    // After processing, if there's a pending entry, emit it
    // (the consumer's listeners are still set up from previous entry)
    this.resume();
    // Check if we should emit finish (e.g., if end() was called while locked)
    this._maybeFinish();
  }

  /**
   * Set up a sparse entry with SparseStream
   */
  private _setupSparseEntry(header: TarHeader): boolean {
    if (!this.sparseInfo) {
      this._emitError(new Error('Sparse info not available'));
      this.state = STATE_END;
      return false;
    }

    // Calculate actual data size (sum of all sparse entry numbytes)
    this.sparseDataRemaining = sparseDataSize(this.sparseInfo.entries);

    // Calculate padding for the actual data size
    this.paddingRemaining = overflow(this.sparseDataRemaining);

    // Create sparse stream for reconstruction
    this.sparseStream = new SparseStream(this.sparseInfo.entries, this.sparseInfo.realSize);

    // Lock until consumer calls next()
    this.locked = true;
    this.pending = true;

    // Store pending entry (the stream looks like a regular entry to consumers)
    const self = this;
    const stream = this.sparseStream as SparseStream;
    const next = function next(): void {
      self._unlock();
    };

    // Change header type to 'file' for consumers (they don't need to know it's sparse)
    header.type = 'file';

    this.pendingEntry = { header, stream, next };

    // Go to sparse data state
    if (this.sparseDataRemaining === 0) {
      // No data - just holes (all zeros)
      this.sparseStream.end();
      this.sparseStream = null;
      this.sparseInfo = null;
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
    } else {
      this.state = STATE_SPARSE_DATA;
    }

    return false; // Don't continue until unlocked
  }

  /**
   * Process extended sparse headers
   */
  private _processSparseExtended(): boolean {
    if (!this.buffer.has(BLOCK_SIZE)) {
      return false; // Need more data
    }

    const extBuf = this.buffer.consume(BLOCK_SIZE);
    const ext = parseGnuSparseExtended(extBuf);

    // Add entries to sparse info
    if (this.sparseInfo) {
      for (let i = 0; i < ext.entries.length; i++) {
        this.sparseInfo.entries.push(ext.entries[i]);
      }

      // Check if more extended headers follow
      if (ext.isExtended) {
        return true; // Continue reading extended headers
      }
    }

    // Done reading extended headers - set up the sparse entry
    if (this.header) {
      return this._setupSparseEntry(this.header);
    }

    // Should not reach here
    this._emitError(new Error('Header not available for sparse entry'));
    this.state = STATE_END;
    return false;
  }

  /**
   * Process sparse file data
   */
  private _processSparseData(): boolean {
    if (this.sparseDataRemaining <= 0) {
      // Done with sparse data
      if (this.sparseStream) {
        this.sparseStream.end();
        this.sparseStream = null;
      }
      this.sparseInfo = null;
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
      return true;
    }

    if (this.buffer.length === 0) {
      return false; // Need more data
    }

    // Read as much as we can
    const toRead = Math.min(this.sparseDataRemaining, this.buffer.length);
    const data = this.buffer.consume(toRead);
    this.sparseDataRemaining -= toRead;

    // Push to sparse stream for reconstruction
    if (this.sparseStream) {
      this.sparseStream.push(data);
    }

    // Check if done
    if (this.sparseDataRemaining <= 0) {
      if (this.sparseStream) {
        this.sparseStream.end();
        this.sparseStream = null;
      }
      this.sparseInfo = null;
      this.state = this.paddingRemaining > 0 ? STATE_PADDING : STATE_HEADER;
    }

    return true;
  }
}
