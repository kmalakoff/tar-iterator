// only patch legacy versions of node.js
var major = +process.versions.node.split('.')[0];
if (major <= 0) {
  var mock = require('mock-require-lazy');
  mock('readable-stream', require('readable-stream'));
}
