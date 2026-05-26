import BaseIterator, { Lock } from 'extract-base-iterator';
import TarExtract from './tar/TarExtract.ts';
import type { Entry, ExtractOptions } from './types.ts';
export default class TarIterator extends BaseIterator<Entry> {
  /** @internal @hidden */
  lock: Lock | null;
  /** @internal @hidden */
  extract: TarExtract | null;
  constructor(source: string | NodeJS.ReadableStream, options?: ExtractOptions);
  end(err?: Error): void;
}
