import { type FileAttributes, FileEntry, type NoParamCallback, waitForAccess } from 'extract-base-iterator';
import fs from 'fs';
import oo from 'on-one';

import type Lock from './lib/Lock.js';
import type { ExtractOptions } from './types.js';

export default class TarFileEntry extends FileEntry {
  private lock: Lock;
  private stream: NodeJS.ReadableStream;

  constructor(attributes: FileAttributes, stream: NodeJS.ReadableStream, lock: Lock) {
    super(attributes);
    this.stream = stream;
    this.lock = lock;
    this.lock.retain();
  }

  create(dest: string, options: ExtractOptions | NoParamCallback, callback: NoParamCallback): undefined | Promise<boolean> {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
    if (typeof callback === 'function') {
      options = options || {};
      return FileEntry.prototype.create.call(this, dest, options, (err?: Error) => {
        callback(err);
        if (this.lock) {
          this.lock.release();
          this.lock = null;
        }
      });
    }

    return new Promise((resolve, reject) => {
      this.create(dest, options, (err?: Error, done?: boolean) => (err ? reject(err) : resolve(done)));
    });
  }

  _writeFile(fullPath: string, _options: ExtractOptions, callback: NoParamCallback): undefined {
    if (!this.stream) {
      callback(new Error('Zip FileEntry missing stream. Check for calling create multiple times'));
      return;
    }

    const stream = this.stream;
    this.stream = null;
    try {
      const res = stream.pipe(fs.createWriteStream(fullPath));
      oo(res, ['error', 'end', 'close', 'finish'], (err?: Error) => {
        err ? callback(err) : waitForAccess(fullPath, callback); // gunzip stream returns prematurely occasionally
      });
    } catch (err) {
      callback(err);
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
