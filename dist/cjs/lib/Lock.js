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
var _lifecycle = /*#__PURE__*/ _interop_require_default(require("lifecycle"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
var _default = _lifecycle.default.RefCountable.extend({
    constructor: function constructor() {
        _lifecycle.default.RefCountable.prototype.constructor.call(this);
    },
    __destroy: function __destroy() {
        if (this.iterator) {
            _extractbaseiterator.default.prototype.end.call(this.iterator, this.err || null);
            this.iterator = null;
        }
    }
});
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }