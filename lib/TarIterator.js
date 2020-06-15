require('./patch');
var inherits = require('inherits');
var fs = require('fs');
var tarStream = require('tar-stream');
var eos = require('end-of-stream');
var BaseIterator = require('extract-base-iterator');

var nextEntry = require('./nextEntry');

function TarIterator(source, options) {
  if (!(this instanceof TarIterator)) return new TarIterator(source, options);
  BaseIterator.call(this, options);

  if (typeof source === 'string') source = fs.createReadStream(source);

  var self = this;
  self.extract = tarStream.extract();
  eos(source.pipe(this.extract), function (err) {
    if (err) return self.stack.push({ error: err });
  });
  self.stack.push(nextEntry.bind(null, null));
  self.resume();
}

inherits(TarIterator, BaseIterator);

module.exports = TarIterator;
