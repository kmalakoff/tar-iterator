import once from 'call-once-fn';
import BaseIterator, { Lock } from 'extract-base-iterator';
import fs from 'fs';

import nextEntry from './nextEntry.ts';
import TarExtract from './tar/TarExtract.ts';

import type { Entry, ExtractOptions } from './types.ts';

export default class TarIterator extends BaseIterator<Entry> {
  /** @internal @hidden */
  lock: Lock | null;
  /** @internal @hidden */
  extract: TarExtract | null;

  constructor(source: string | NodeJS.ReadableStream, options: ExtractOptions = {}) {
    super(options);
    this.lock = new Lock();
    this.lock.onDestroy = (err) => BaseIterator.prototype.end.call(this, err);

    let cancelled = false;
    const setup = (): void => {
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

      // Register cleanup for source stream
      const stream = source as NodeJS.ReadableStream;
      this.lock.registerCleanup(() => {
        const s = stream as NodeJS.ReadableStream & { destroy?: () => void };
        if (typeof s.destroy === 'function') s.destroy();
      });

      const end = once(cb);
      const self = this;
      let firstData = true;
      (source as NodeJS.ReadableStream).on('data', function onData(chunk) {
        try {
          if (self.extract) self.extract.write(chunk);
          if (firstData) {
            firstData = false;
            end();
          }
        } catch (err) {
          // Handle synchronous errors from TarExtract (e.g., invalid format)
          end(err);
        }
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
    const lock = this.lock;
    if (lock) {
      this.lock = null; // Clear FIRST to prevent re-entrancy
      lock.err = err;
      lock.release(); // Lock.__destroy() handles BaseIterator.end()
    }
    this.extract = null;
  }
}
