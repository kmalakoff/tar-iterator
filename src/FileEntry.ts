import once from 'call-once-fn';
import { type FileAttributes, FileEntry, type Lock, type NoParamCallback, waitForAccess } from 'extract-base-iterator';
import fs from 'graceful-fs';
import oo from 'on-one';

import type { ExtractOptions } from './types.ts';

export default class TarFileEntry extends FileEntry {
  private lock: Lock;
  private stream: NodeJS.ReadableStream;

  constructor(attributes: FileAttributes, stream: NodeJS.ReadableStream, lock: Lock) {
    super(attributes);
    this.stream = stream;
    this.lock = lock;
    this.lock.retain();
  }

  create(dest: string, callback: NoParamCallback): void;
  create(dest: string, options: ExtractOptions, callback: NoParamCallback): void;
  create(dest: string, options?: ExtractOptions): Promise<boolean>;
  create(dest: string, options?: ExtractOptions | NoParamCallback, callback?: NoParamCallback): void | Promise<boolean> {
    callback = typeof options === 'function' ? options : callback;
    options = typeof options === 'function' ? {} : ((options || {}) as ExtractOptions);

    if (typeof callback === 'function') {
      return FileEntry.prototype.create.call(this, dest, options, (err?: Error) => {
        callback(err);
        if (this.lock) {
          this.lock.release();
          this.lock = null;
        }
      });
    }

    return new Promise((resolve, reject) => this.create(dest, options, (err?: Error, done?: boolean) => (err ? reject(err) : resolve(done))));
  }

  _writeFile(fullPath: string, _options: ExtractOptions, callback: NoParamCallback): void {
    if (!this.stream) {
      callback(new Error('FileEntry missing stream. Check for calling create multiple times'));
      return;
    }

    const stream = this.stream;
    this.stream = null; // Prevent reuse

    // Use once since errors can come from either stream
    const cb = once((err?: Error) => {
      err ? callback(err) : waitForAccess(fullPath, callback); // gunzip stream returns prematurely occasionally
    });

    try {
      const writeStream = fs.createWriteStream(fullPath);

      // Listen for errors on source stream (errors don't propagate through pipe)
      stream.on('error', (streamErr: Error) => {
        // Destroy the write stream on source error.
        // On Node 0.8, destroy() emits 'close' before 'error'. Since on-one is listening
        // for ['error', 'close', 'finish'], it catches 'close' first, calls our callback,
        // and removes ALL listeners - including the 'error' listener. The subsequent EBADF
        // error then fires with no handler, causing an uncaught exception.
        // Adding a no-op error handler ensures there's always a listener for any error.
        const ws = writeStream as fs.WriteStream & { destroy?: () => void };
        writeStream.on('error', () => {});
        if (typeof ws.destroy === 'function') ws.destroy();
        cb(streamErr);
      });

      // Pipe and listen for write stream completion/errors
      stream.pipe(writeStream);
      oo(writeStream, ['error', 'close', 'finish'], cb);
    } catch (err) {
      cb(err);
    }
  }

  destroy() {
    FileEntry.prototype.destroy.call(this);
    if (this.stream) {
      this.stream.resume(); // drain stream
      this.stream = null;
    }
    if (this.lock) {
      this.lock.release();
      this.lock = null;
    }
  }
}
