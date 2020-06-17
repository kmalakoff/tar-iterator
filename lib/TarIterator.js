require('./patch');
var inherits = require('inherits');
var fs = require('fs');
var tarStream = require('tar-stream');
var eos = require('end-of-stream');
var Queue = require('queue-cb');
var BaseIterator = require('extract-base-iterator');

var nextEntry = require('./nextEntry');

function TarIterator(source, options) {
  if (!(this instanceof TarIterator)) return new TarIterator(source, options);
  BaseIterator.call(this, options);

  var self = this;
  var queue = Queue(1);
  self.processing++;
  self.extract = tarStream.extract();

  if (typeof source === 'string') source = fs.createReadStream(source);
  queue.defer(function (callback) {
    var data = null;
    function cleanup() {
      source.removeListener('error', onError);
      source.removeListener('data', onData);
    }
    function onError(err) {
      data = err;
      cleanup();
      callback(err);
    }
    function onData() {
      data = true;
      cleanup();
      callback();
    }
    source.on('error', onError);
    source.on('data', onData);
    eos(source.pipe(self.extract), function (err) {
      if (data) return;
      cleanup();
      callback(err);
    });
  });

  // start processing
  queue.await(function (err) {
    self.processing--;
    if (self.done) return;
    err ? self.end(err) : self.push(nextEntry.bind(null, null));
  });
}

inherits(TarIterator, BaseIterator);

module.exports = TarIterator;
