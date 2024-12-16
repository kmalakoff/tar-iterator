"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    DirectoryEntry: function() {
        return _extractbaseiterator.DirectoryEntry;
    },
    FileEntry: function() {
        return _FileEntry.default;
    },
    LinkEntry: function() {
        return _extractbaseiterator.LinkEntry;
    },
    SymbolicLinkEntry: function() {
        return _extractbaseiterator.SymbolicLinkEntry;
    },
    default: function() {
        return _default;
    }
});
var _TarIterator = /*#__PURE__*/ _interop_require_default(require("./TarIterator.js"));
var _FileEntry = /*#__PURE__*/ _interop_require_default(require("./FileEntry.js"));
var _extractbaseiterator = require("extract-base-iterator");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
var _default = _TarIterator.default;
/* CJS INTEROP */ if (exports.__esModule && exports.default) { try { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) { exports.default[key] = exports[key]; } } catch (_) {}; module.exports = exports.default; }