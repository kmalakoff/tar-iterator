import BaseIterator from 'extract-base-iterator';
import type TarExtract from '../tar/TarExtract.ts';

export default class Lock {
  private count = 1;

  // members
  iterator: BaseIterator = null;
  err: Error = null;

  // cleanup resources
  /** @internal @hidden */
  extract: TarExtract = null;
  sourceStream: NodeJS.ReadableStream = null;

  retain() {
    this.count++;
  }

  release() {
    if (this.count <= 0) throw new Error('Lock count is corrupted');
    this.count--;
    if (this.count === 0) this.__destroy();
  }

  private __destroy() {
    // Destroy source stream FIRST to stop data flow
    if (this.sourceStream) {
      const stream = this.sourceStream as NodeJS.ReadableStream & { destroy?: () => void };
      if (typeof stream.destroy === 'function') stream.destroy();
      this.sourceStream = null;
    }

    // Clear extract reference
    if (this.extract) {
      this.extract = null;
    }

    // Call BaseIterator.end() LAST
    if (this.iterator) {
      BaseIterator.prototype.end.call(this.iterator, this.err || null);
      this.iterator = null;
    }
  }
}
