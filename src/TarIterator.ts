import once from 'call-once-fn';
import BaseIterator from 'extract-base-iterator';
import fs from 'fs';
import tarStream from 'tar-stream-compat';

import Lock from './lib/Lock.js';
import nextEntry from './nextEntry.js';

import type { ExtractOptions } from './types.js';

export default class TarIterator extends BaseIterator<unknown> {
  lock: Lock;
  extract: NodeJS.WritableStream;

  constructor(source: string | NodeJS.ReadableStream, options: ExtractOptions = {}) {
    super(options);
    this.lock = new Lock();
    this.lock.iterator = this;

    let cancelled = false;
    const setup = (): undefined => {
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
      (source as NodeJS.ReadableStream).on('data', () => end());
      (source as NodeJS.ReadableStream).on('error', end);
      (source as NodeJS.ReadableStream).pipe(this.extract);
    };
    pipe((err) => {
      this.processing.remove(setup);
      if (this.done || cancelled) return; // done
      err ? this.end(err) : this.push(nextEntry.bind(null, null));
    });
  }

  end(err?: Error) {
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
