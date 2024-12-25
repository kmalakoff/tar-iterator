import fs from 'fs';
import eos from 'end-of-stream';
import { FileEntry } from 'extract-base-iterator';
// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import Promise from 'pinkie-promise';
import waitForAccess from './lib/waitForAccess.mjs';

export default class TarFileEntry extends FileEntry {
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

    const self = this;
    if (typeof callback === 'function') {
      options = options || {};
      return FileEntry.prototype.create.call(this, dest, options, function createCallback(err) {
        callback(err);
        if (self.lock) {
          self.lock.release();
          self.lock = null;
        }
      });
    }

    return new Promise(function createPromise(resolve, reject) {
      self.create(dest, options, function createCallback(err, done) {
        err ? reject(err) : resolve(done);
      });
    });
  }

  _writeFile(fullPath, _options, callback) {
    if (!this.stream) return callback(new Error('Zip FileEntry missing stream. Check for calling create multiple times'));

    const stream = this.stream;
    this.stream = null;
    try {
      const res = stream.pipe(fs.createWriteStream(fullPath));
      eos(res, (err) => {
        err ? callback(err) : waitForAccess(fullPath, callback); // gunzip stream returns prematurely occassionally
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
