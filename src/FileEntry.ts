import fs from 'fs';
import { FileEntry } from 'extract-base-iterator';
import oo from 'on-one';
import waitForAccess from './lib/waitForAccess.js';

import type { LockT } from './types.js';

export default class TarFileEntry extends FileEntry {
  private lock: LockT;
  private stream: NodeJS.ReadableStream;

  constructor(attributes, stream, lock) {
    super(attributes);
    this.stream = stream;
    this.lock = lock;
    this.lock.retain();
  }

  create(dest, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
    if (typeof callback === 'function') {
      options = options || {};
      return FileEntry.prototype.create.call(this, dest, options, (err) => {
        callback(err);
        if (this.lock) {
          this.lock.release();
          this.lock = null;
        }
      });
    }

    return new Promise((resolve, reject) => this.create(dest, options, (err, done) => (err ? reject(err) : resolve(done))));
  }

  _writeFile(fullPath, _options, callback) {
    if (!this.stream) return callback(new Error('Zip FileEntry missing stream. Check for calling create multiple times'));

    const stream = this.stream;
    this.stream = null;
    try {
      const res = stream.pipe(fs.createWriteStream(fullPath));
      oo(res, ['error', 'end', 'close', 'finish'], (err) => {
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
