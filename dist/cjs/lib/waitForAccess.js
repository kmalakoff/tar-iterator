"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return waitForAccess;
    }
});
var _fsaccesscompat = /*#__PURE__*/ _interop_require_default(require("fs-access-compat"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function waitForAccess(fullPath, callback) {
    (0, _fsaccesscompat.default)(fullPath, function(err) {
        if (err) return waitForAccess(fullPath, callback);
        callback();
    });
}
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }