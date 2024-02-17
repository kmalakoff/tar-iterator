"use strict";
var BaseIterator = require("extract-base-iterator").default;
module.exports = require("./TarIterator");
module.exports.DirectoryEntry = BaseIterator.DirectoryEntry;
module.exports.FileEntry = require("./FileEntry");
module.exports.LinkEntry = BaseIterator.LinkEntry;
module.exports.SymbolicLinkEntry = BaseIterator.SymbolicLinkEntry;

if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  for (var key in exports) exports.default[key] = exports[key];
  module.exports = exports.default;
}