"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return TarIterator;
    }
});
var _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
var _endofstream = /*#__PURE__*/ _interop_require_default(require("end-of-stream"));
var _extractbaseiterator = /*#__PURE__*/ _interop_require_default(require("extract-base-iterator"));
var _queuecb = /*#__PURE__*/ _interop_require_default(require("queue-cb"));
var _tarstreamcompat = /*#__PURE__*/ _interop_require_default(require("tar-stream-compat"));
var _Lock = /*#__PURE__*/ _interop_require_default(require("./lib/Lock.js"));
var _fifoRemove = /*#__PURE__*/ _interop_require_default(require("./lib/fifoRemove.js"));
var _nextEntry = /*#__PURE__*/ _interop_require_default(require("./nextEntry.js"));
function _assert_this_initialized(self) {
    if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }
    return self;
}
function _call_super(_this, derived, args) {
    derived = _get_prototype_of(derived);
    return _possible_constructor_return(_this, _is_native_reflect_construct() ? Reflect.construct(derived, args || [], _get_prototype_of(_this).constructor) : derived.apply(_this, args));
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _get_prototype_of(o) {
    _get_prototype_of = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _get_prototype_of(o);
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) _set_prototype_of(subClass, superClass);
}
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _possible_constructor_return(self, call) {
    if (call && (_type_of(call) === "object" || typeof call === "function")) {
        return call;
    }
    return _assert_this_initialized(self);
}
function _set_prototype_of(o, p) {
    _set_prototype_of = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return _set_prototype_of(o, p);
}
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
function _is_native_reflect_construct() {
    try {
        var result = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
    } catch (_) {}
    return (_is_native_reflect_construct = function() {
        return !!result;
    })();
}
var TarIterator = /*#__PURE__*/ function(BaseIterator) {
    "use strict";
    _inherits(TarIterator, BaseIterator);
    function TarIterator(source, options) {
        _class_call_check(this, TarIterator);
        var _this;
        var setup = function setup() {
            cancelled = true;
        };
        _this = _call_super(this, TarIterator, [
            options
        ]);
        _this.lock = new _Lock.default();
        _this.lock.iterator = _this;
        var queue = (0, _queuecb.default)(1);
        var cancelled = false;
        _this.processing.push(setup);
        _this.extract = _tarstreamcompat.default.extract();
        queue.defer(function(callback) {
            var cleanup = function cleanup() {
                source.removeListener('error', onError);
                source.removeListener('data', onData);
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
            try {
                if (typeof source === 'string') source = _fs.default.createReadStream(source);
            } catch (err) {
                callback(err);
            }
            var data = null;
            source.on('error', onError);
            source.on('data', onData);
            (0, _endofstream.default)(source.pipe(_this.extract), function(err) {
                if (data) return;
                cleanup();
                callback(err);
            });
        });
        // start processing
        queue.await(function(err) {
            (0, _fifoRemove.default)(_this.processing, setup);
            if (_this.done || cancelled) return; // done
            err ? _this.end(err) : _this.push(_nextEntry.default.bind(null, null));
        });
        return _this;
    }
    _create_class(TarIterator, [
        {
            key: "end",
            value: function end(err) {
                if (this.lock) {
                    this.lock.err = err;
                    this.lock.release();
                    this.lock = null;
                } else {
                    _extractbaseiterator.default.prototype.end.call(this, err); // call in lock release so end is properly handled
                }
                this.extract = null;
            }
        }
    ]);
    return TarIterator;
}(_extractbaseiterator.default);
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }