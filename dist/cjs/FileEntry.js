"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return TarFileEntry;
    }
});
var _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
var _endofstream = /*#__PURE__*/ _interop_require_default(require("end-of-stream"));
var _extractbaseiterator = require("extract-base-iterator");
var _waitForAccess = /*#__PURE__*/ _interop_require_default(require("./lib/waitForAccess.js"));
function _assert_this_initialized(self) {
    if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }
    return self;
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
    if (typeof Reflect === "undefined" || !Reflect.construct) return false;
    if (Reflect.construct.sham) return false;
    if (typeof Proxy === "function") return true;
    try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
        return true;
    } catch (e) {
        return false;
    }
}
function _create_super(Derived) {
    var hasNativeReflectConstruct = _is_native_reflect_construct();
    return function _createSuperInternal() {
        var Super = _get_prototype_of(Derived), result;
        if (hasNativeReflectConstruct) {
            var NewTarget = _get_prototype_of(this).constructor;
            result = Reflect.construct(Super, arguments, NewTarget);
        } else {
            result = Super.apply(this, arguments);
        }
        return _possible_constructor_return(this, result);
    };
}
var TarFileEntry = /*#__PURE__*/ function(FileEntry) {
    "use strict";
    _inherits(TarFileEntry, FileEntry);
    var _super = _create_super(TarFileEntry);
    function TarFileEntry(attributes, stream, lock) {
        _class_call_check(this, TarFileEntry);
        var _this;
        _this = _super.call(this, attributes);
        _this.stream = stream;
        _this.lock = lock;
        _this.lock.retain();
        return _this;
    }
    _create_class(TarFileEntry, [
        {
            key: "create",
            value: function create(dest, options, callback) {
                if (typeof options === "function") {
                    callback = options;
                    options = null;
                }
                var self = this;
                if (typeof callback === "function") {
                    options = options || {};
                    return _extractbaseiterator.FileEntry.prototype.create.call(this, dest, options, function createCallback(err) {
                        callback(err);
                        if (self.lock) {
                            self.lock.release();
                            self.lock = null;
                        }
                    });
                }
                return new Promise(function createPromise(resolve, reject) {
                    self.create(dest, options, function createCallback(err, done) {
                        err ? reject(err) : resolve(done);
                    });
                });
            }
        },
        {
            key: "_writeFile",
            value: function _writeFile(fullPath, _options, callback) {
                if (!this.stream) return callback(new Error("Zip FileEntry missing stream. Check for calling create multiple times"));
                var stream = this.stream;
                this.stream = null;
                try {
                    var res = stream.pipe(_fs.default.createWriteStream(fullPath));
                    (0, _endofstream.default)(res, function(err) {
                        err ? callback(err) : (0, _waitForAccess.default)(fullPath, callback); // gunzip stream returns prematurely occassionally
                    });
                } catch (err) {
                    callback(err);
                }
            }
        },
        {
            key: "destroy",
            value: function destroy() {
                _extractbaseiterator.FileEntry.prototype.destroy.call(this);
                if (this.stream) {
                    this.stream.resume(); // drain stream
                    this.stream = null;
                }
                if (this.lock) {
                    this.lock.release();
                    this.lock = null;
                }
            }
        }
    ]);
    return TarFileEntry;
}(_extractbaseiterator.FileEntry);
/* CJS INTEROP */ if (exports.__esModule && exports.default) { module.exports = exports.default; for (var key in exports) module.exports[key] = exports[key]; }