import type { CallFn } from 'call-once-fn';
import once from 'call-once-fn';
import BaseIterator, { destroyStream, Lock } from 'extract-base-iterator';
import fs from 'graceful-fs';
import oo from 'on-one';
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
    lock.onDestroy = (err: Error | null) => BaseIterator.prototype.end.call(this, err);

    let cancelled = false;
    const setup = (): void => {
      cancelled = true;
    };
    this.processing.push(setup);

    this.extract = new TarExtract();

    const pipe = (cb: (err?: Error | null) => void): void => {
      try {
        if (typeof source === 'string') source = fs.createReadStream(source);
      } catch (err) {
        cb(err as Error);
        return;
      }

      const stream = source as NodeJS.ReadableStream;
      lock.registerCleanup(() => {
        destroyStream(stream);
      });

      const end = once(cb as unknown as CallFn) as unknown as (err?: Error | null) => void;
      const self = this;
      let firstData = true;
      const onData = (chunk: Buffer): void => {
        if (!self.extract) return;
        try {
          self.extract.write(chunk);
          if (firstData) {
            firstData = false;
            end();
          }
        } catch (err) {
          fail(err as Error);
        }
      };
      const fail = (err: Error): void => {
        stream.removeListener('data', onData);
        if (self.extract) self.extract.destroy(err);
        if (firstData) {
          firstData = false;
          end(err);
        } else {
          self.end(err);
        }
      };
      stream.on('data', onData);
      oo(stream, ['error', 'end'], ((err?: Error | null) => {
        if (err) {
          fail(err);
        } else {
          stream.removeListener('data', onData);
          if (firstData) {
            firstData = false;
            if (self.extract) self.extract.destroy();
            self.end();
          } else if (self.extract) {
            self.extract.end();
          }
        }
      }) as unknown as CallFn);
    };
    pipe((err?: Error | null) => {
      this.processing.remove(setup);
      if (this.done || cancelled) return;
      err ? this.end(err) : this.push(nextEntry.bind(null, null as unknown as TarNext) as unknown as Parameters<typeof this.push>[0]);
    });
  }

  end(err?: Error | null) {
    const lock = this.lock;
    if (lock) {
      this.lock = null;
      lock.err = err ?? null;
      lock.release();
    }
    this.extract = null;
  }
}
