"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
var _extractbaseiterator = /*#__PURE__*/ _interop_require_default(require("extract-base-iterator"));
var _TarIteratorcjs = /*#__PURE__*/ _interop_require_default(require("./TarIterator.js"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
_TarIteratorcjs.default.DirectoryEntry = _extractbaseiterator.default.DirectoryEntry;
_TarIteratorcjs.default.FileEntry = require("./FileEntry.js");
_TarIteratorcjs.default.LinkEntry = _extractbaseiterator.default.LinkEntry;
_TarIteratorcjs.default.SymbolicLinkEntry = _extractbaseiterator.default.SymbolicLinkEntry;
var _default = _TarIteratorcjs.default;

if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  for (var key in exports) exports.default[key] = exports[key];
  module.exports = exports.default;
}