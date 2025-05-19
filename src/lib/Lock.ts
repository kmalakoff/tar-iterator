import BaseIterator from 'extract-base-iterator';
import LC from 'lifecycle';

export default LC.RefCountable.extend({
  constructor: function () {
    LC.RefCountable.prototype.constructor.call(this);
  },
  __destroy: function () {
    if (this.iterator) {
      BaseIterator.prototype.end.call(this.iterator, this.err || null);
      this.iterator = null;
    }
  },
});
