import once from 'call-once-fn';
import BaseIterator from 'extract-base-iterator';
import fs from 'fs';

import Lock from './lib/Lock.ts';
import nextEntry from './nextEntry.ts';
import TarExtract from './tar/TarExtract.ts';

import type { ExtractOptions } from './types.ts';

export default class TarIterator extends BaseIterator {
  /** @internal @hidden */
  lock: Lock;
  /** @internal @hidden */
  extract: TarExtract;

  constructor(source: string | NodeJS.ReadableStream, options: ExtractOptions = {}) {
    super(options);
    this.lock = new Lock();
    this.lock.iterator = this;

    let cancelled = false;
    const setup = (): undefined => {
      cancelled = true;
    };
    this.processing.push(setup);

    // Use our pure TarExtract instead of tar-stream-compat
    // Note: options passed here are ExtractOptions (strip, force, etc.)
    // TarExtract uses TarExtractOptions (filenameEncoding, etc.) which is different
    this.extract = new TarExtract();

    const pipe = (cb) => {
      try {
        if (typeof source === 'string') source = fs.createReadStream(source);
      } catch (err) {
        cb(err);
      }

      const end = once(cb);
      const self = this;
      (source as NodeJS.ReadableStream).on('data', function onData(chunk) {
        try {
          if (self.extract) self.extract.write(chunk);
        } catch (err) {
          // Handle synchronous errors from TarExtract (e.g., invalid format)
          end(err);
        }
      });
      (source as NodeJS.ReadableStream).on('data', function onFirstData() {
        end();
      });
      (source as NodeJS.ReadableStream).on('error', end);
      (source as NodeJS.ReadableStream).on('end', function onEnd() {
        if (self.extract) self.extract.end();
      });
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
