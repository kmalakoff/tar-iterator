const LC = require('lifecycle');
const BaseIterator = require('extract-base-iterator').default;

module.exports = LC.RefCountable.extend({
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
