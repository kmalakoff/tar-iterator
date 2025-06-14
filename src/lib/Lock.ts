import BaseIterator from 'extract-base-iterator';

export default class Lock {
  private count = 1;

  // members
  iterator: BaseIterator<unknown> = null;
  err: Error = null;

  retain() {
    this.count++;
  }

  release() {
    if (this.count <= 0) throw new Error('Lock count is corrupted');
    this.count--;
    if (this.count === 0) this.__destroy();
  }

  private __destroy() {
    if (this.iterator) {
      BaseIterator.prototype.end.call(this.iterator, this.err || null);
      this.iterator = null;
    }
  }
}
