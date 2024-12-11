"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return nextEntry;
    }
});
var _path = /*#__PURE__*/ _interop_require_default(require("path"));
var _calloncefn = /*#__PURE__*/ _interop_require_default(require("call-once-fn"));
var _lodashcompact = /*#__PURE__*/ _interop_require_default(require("lodash.compact"));
var _extractbaseiterator = require("extract-base-iterator");
var _FileEntry = /*#__PURE__*/ _interop_require_default(require("./FileEntry.js"));
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function nextEntry(next, iterator, callback) {
    var extract = iterator.extract;
    if (!extract) return callback(new Error('Extract missing'));
    var _callback = callback;
    callback = (0, _calloncefn.default)(function callback(err, entry, next) {
        extract.removeListener('entry', onEntry);
        extract.removeListener('error', onError);
        extract.removeListener('finish', onEnd);
        // keep processing
        if (entry) iterator.stack.push(nextEntry.bind(null, next));
        // use null to indicate iteration is complete
        _callback(err, err || !entry ? null : entry);
    });
    var onError = callback;
    var onEnd = callback.bind(null, null);
    var onEntry = function onEntry(header, stream, next) {
        if (iterator.done) return callback(null, null, next);
        var attributes = _object_spread({}, header);
        attributes.path = (0, _lodashcompact.default)(header.name.split(_path.default.sep)).join(_path.default.sep);
        attributes.mtime = new Date(attributes.mtime);
        switch(attributes.type){
            case 'directory':
                stream.resume(); // drain stream
                return callback(null, new _extractbaseiterator.DirectoryEntry(attributes), next);
            case 'symlink':
                stream.resume(); // drain stream
                attributes.linkpath = header.linkname;
                return callback(null, new _extractbaseiterator.SymbolicLinkEntry(attributes), next);
            case 'link':
                stream.resume(); // drain stream
                attributes.linkpath = header.linkname;
                return callback(null, new _extractbaseiterator.LinkEntry(attributes), next);
            case 'file':
                return callback(null, new _FileEntry.default(attributes, stream, iterator.lock), next);
        }
        stream.resume(); // drain stream
        return callback(new Error("Unrecognized entry type: ".concat(attributes.type)), null, next);
    };
    extract.on('entry', onEntry);
    extract.on('error', onError);
    extract.on('finish', onEnd);
    if (next) next();
}
/* CJS INTEROP */ if (exports.__esModule && exports.default) { try { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) { exports.default[key] = exports[key]; } } catch (_) {}; module.exports = exports.default; }