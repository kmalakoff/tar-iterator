"use strict";
var access = require("fs-access-compat");
function waitForAccess(fullPath, callback) {
    access(fullPath, function(err) {
        if (err) return waitForAccess(fullPath, callback);
        callback();
    });
}
module.exports = waitForAccess;

if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  for (var key in exports) exports.default[key] = exports[key];
  module.exports = exports.default;
}