var inherits = require('inherits');
var BaseIterator = require('extract-base-iterator');
var fs = require('fs');
var eos = require('end-of-stream');

var waitForAccess = require('./waitForAccess');

function FileEntry(attributes, stream) {
  BaseIterator.FileEntry.call(this, attributes);
  this.stream = stream;
}

inherits(FileEntry, BaseIterator.FileEntry);

FileEntry.prototype._writeFile = function _writeFile(fullPath, options, callback) {
  if (!this.stream) return callback(new Error('Zip FileEntry missing stream. Check for calling create multiple times'));

  var stream = this.stream;
  this.stream = null;
  var res = stream.pipe(fs.createWriteStream(fullPath));
  eos(res, function (err) {
    err ? callback(err) : waitForAccess(fullPath, callback); // gunzip stream returns prematurely occassionally
  });
};

FileEntry.prototype.destroy = function destroy() {
  BaseIterator.FileEntry.prototype.destroy.call(this);
  if (this.stream) {
    this.stream = null;
  }
};

module.exports = FileEntry;
