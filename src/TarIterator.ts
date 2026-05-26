import type { CallFn } from 'call-once-fn';
import once from 'call-once-fn';
import BaseIterator, { Lock } from 'extract-base-iterator';
import fs from 'graceful-fs';
import type { TarNext } from './nextEntry.ts';
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
    const lock = new Lock();
    this.lock = lock;
    lock.onDestroy = (err: Error | null) => BaseIterator.prototype.end.call(this, err ?? undefined);

    let cancelled = false;
    const setup = (): void => {
      cancelled = true;
    };
    this.processing.push(setup);

    this.extract = new TarExtract();

    const pipe = (cb: (err?: Error) => void): void => {
      try {
        if (typeof source === 'string') source = fs.createReadStream(source);
      } catch (err) {
        cb(err as Error);
      }

      const stream = source as NodeJS.ReadableStream;
      lock.registerCleanup(() => {
        const s = stream as NodeJS.ReadableStream & { destroy?: () => void };
        if (typeof s.destroy === 'function') s.destroy();
      });

      const end = once(cb as unknown as CallFn) as unknown as (err?: Error) => void;
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
          end(err as Error);
        }
      });
      (source as NodeJS.ReadableStream).on('error', end as (err: Error) => void);
      (source as NodeJS.ReadableStream).on('end', function onEnd() {
        if (self.extract) self.extract.end();
      });
    };
    pipe((err?: Error) => {
      this.processing.remove(setup);
      if (this.done || cancelled) return;
      err ? this.end(err) : this.push(nextEntry.bind(null, null as unknown as TarNext) as unknown as Parameters<typeof this.push>[0]);
    });
  }

  end(err?: Error) {
    const lock = this.lock;
    if (lock) {
      this.lock = null;
      lock.err = err ?? null;
      lock.release();
    }
    this.extract = null;
  }
}
