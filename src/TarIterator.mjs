import fs from 'fs';
import once from 'call-once-fn';
import BaseIterator from 'extract-base-iterator';
import tarStream from 'tar-stream-compat';

import Lock from './lib/Lock.mjs';
import fifoRemove from './lib/fifoRemove.mjs';
import nextEntry from './nextEntry.mjs';

export default class TarIterator extends BaseIterator {
  constructor(source, options) {
    super(options);
    this.lock = new Lock();
    this.lock.iterator = this;

    let cancelled = false;
    const setup = () => {
      cancelled = true;
    };
    this.processing.push(setup);
    this.extract = tarStream.extract();

    const pipe = (cb) => {
      try {
        if (typeof source === 'string') source = fs.createReadStream(source);
      } catch (err) {
        cb(err);
      }

      const end = once(cb);
      source.on('data', () => end());
      source.on('error', end);
      source.pipe(this.extract);
    };
    pipe((err) => {
      fifoRemove(this.processing, setup);
      if (this.done || cancelled) return; // done
      err ? this.end(err) : this.push(nextEntry.bind(null, null));
    });
  }

  end(err) {
    if (this.lock) {
      this.lock.err = err;
      this.lock.release();
      this.lock = null;
    } else {
      BaseIterator.prototype.end.call(this, err); // call in lock release so end is properly handled
    }
    this.extract = null;
  }
}
