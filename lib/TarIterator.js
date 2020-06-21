var inherits = require('inherits');
var fs = require('fs');
var tarStream = require('tar-stream-compat');
var eos = require('end-of-stream');
var Queue = require('queue-cb');
var BaseIterator = require('extract-base-iterator');

var nextEntry = require('./nextEntry');
var fifoRemove = require('./fifoRemove');

function TarIterator(source, options) {
  if (!(this instanceof TarIterator)) return new TarIterator(source, options);
  BaseIterator.call(this, options);

  var self = this;
  var queue = Queue(1);
  var cancelled = false;
  function setup() {
    cancelled = true;
  }
  this.processing.push(setup);
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
    fifoRemove(self.processing, setup);
    if (self.done || cancelled) return;
    err ? self.end(err) : self.push(nextEntry.bind(null, null));
  });
}

inherits(TarIterator, BaseIterator);

TarIterator.prototype.end = function end(err) {
  BaseIterator.prototype.end.call(this, err);
  if (this.extract) {
    this.extract = null;
  }
};

module.exports = TarIterator;
