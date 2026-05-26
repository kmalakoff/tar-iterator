import type { CallFn } from 'call-once-fn';
import once from 'call-once-fn';
import { type FileAttributes, FileEntry, type Lock, type NoParamCallback, waitForAccess } from 'extract-base-iterator';
import fs from 'graceful-fs';
import oo from 'on-one';

import type { ExtractOptions } from './types.ts';

export default class TarFileEntry extends FileEntry {
  private lock: Lock | null;
  private stream: NodeJS.ReadableStream | null;

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
      const cb: NoParamCallback = (err?: Error) => {
        (callback as NoParamCallback)(err);
        if (this.lock) {
          this.lock.release();
          this.lock = null;
        }
      };
      super.create(dest, options as ExtractOptions, cb);
      return;
    }

    return new Promise((resolve, reject) => this.create(dest, options as ExtractOptions, (err?: Error) => (err ? reject(err) : resolve(true))));
  }

  _writeFile(fullPath: string, _options: ExtractOptions, callback: NoParamCallback): void {
    if (!this.stream) {
      callback(new Error('FileEntry missing stream. Check for calling create multiple times'));
      return;
    }

    const stream = this.stream;
    this.stream = null;

    const cb = once(((err?: Error) => {
      err ? callback(err) : waitForAccess(fullPath, callback);
    }) as unknown as CallFn) as unknown as (err?: Error) => void;

    try {
      const writeStream = fs.createWriteStream(fullPath);

      stream.on('error', (streamErr: Error) => {
        const ws = writeStream as fs.WriteStream & { destroy?: () => void };
        writeStream.on('error', () => {});
        if (typeof ws.destroy === 'function') ws.destroy();
        cb(streamErr);
      });

      stream.pipe(writeStream);
      oo(writeStream, ['error', 'close', 'finish'], cb as unknown as CallFn);
    } catch (err) {
      cb(err as Error);
    }
  }

  destroy() {
    super.destroy();
    if (this.stream) {
      this.stream.resume();
      this.stream = null;
    }
    if (this.lock) {
      this.lock.release();
      this.lock = null;
    }
  }
}
