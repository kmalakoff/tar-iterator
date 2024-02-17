"use strict";
function _instanceof(left, right) {
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else {
        return left instanceof right;
    }
}
var inherits = require("inherits");
var fs = require("fs");
var tarStream = require("tar-stream-compat");
var eos = require("end-of-stream");
var Queue = require("queue-cb");
var BaseIterator = require("extract-base-iterator").default;
var nextEntry = require("./nextEntry.js");
var fifoRemove = require("./lib/fifoRemove.js");
var Lock = require("./lib/Lock.js");
function TarIterator(source, options) {
    var _this = this;
    if (!_instanceof(this, TarIterator)) return new TarIterator(source, options);
    BaseIterator.call(this, options);
    this.lock = new Lock();
    this.lock.iterator = this;
    var queue = Queue(1);
    var cancelled = false;
    function setup() {
        cancelled = true;
    }
    this.processing.push(setup);
    this.extract = tarStream.extract();
    if (typeof source === "string") source = fs.createReadStream(source);
    queue.defer(function(callback) {
        var cleanup = function cleanup() {
            source.removeListener("error", onError);
            source.removeListener("data", onData);
        };
        var onError = function onError(err) {
            data = err;
            cleanup();
            callback(err);
        };
        var onData = function onData() {
            data = true;
            cleanup();
            callback();
        };
        var data = null;
        source.on("error", onError);
        source.on("data", onData);
        eos(source.pipe(_this.extract), function(err) {
            if (data) return;
            cleanup();
            callback(err);
        });
    });
    // start processing
    queue.await(function(err) {
        fifoRemove(_this.processing, setup);
        if (_this.done || cancelled) return; // done
        err ? _this.end(err) : _this.push(nextEntry.bind(null, null));
    });
}
inherits(TarIterator, BaseIterator);
TarIterator.prototype.end = function end(err) {
    if (this.lock) {
        this.lock.err = err;
        this.lock.release();
        this.lock = null;
    } else {
        BaseIterator.prototype.end.call(this, err); // call in lock release so end is properly handled
    }
    this.extract = null;
};
module.exports = TarIterator;

if ((typeof exports.default === 'function' || (typeof exports.default === 'object' && exports.default !== null)) && typeof exports.default.__esModule === 'undefined') {
  Object.defineProperty(exports.default, '__esModule', { value: true });
  for (var key in exports) exports.default[key] = exports[key];
  module.exports = exports.default;
}