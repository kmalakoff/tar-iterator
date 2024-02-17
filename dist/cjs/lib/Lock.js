"use strict";
var LC = require("lifecycle");
var BaseIterator = require("extract-base-iterator").default;
module.exports = LC.RefCountable.extend({
    constructor: function constructor() {
        LC.RefCountable.prototype.constructor.call(this);
    },
    __destroy: function __destroy() {
        if (this.iterator) {
            BaseIterator.prototype.end.call(this.iterator, this.err || null);
            this.iterator = null;
        }
    }
});

if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  for (var key in exports) exports.default[key] = exports[key];
  module.exports = exports.default;
}