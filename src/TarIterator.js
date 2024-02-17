const inherits = require('inherits');
const fs = require('fs');
const tarStream = require('tar-stream-compat');
const eos = require('end-of-stream');
const Queue = require('queue-cb');
const BaseIterator = require('extract-base-iterator').default;

const nextEntry = require('./nextEntry');
const fifoRemove = require('./lib/fifoRemove');
const Lock = require('./lib/Lock');

function TarIterator(source, options) {
  if (!(this instanceof TarIterator)) return new TarIterator(source, options);
  BaseIterator.call(this, options);
  this.lock = new Lock();
  this.lock.iterator = this;

  const queue = Queue(1);
  let cancelled = false;
  function setup() {
    cancelled = true;
  }
  this.processing.push(setup);
  this.extract = tarStream.extract();

  if (typeof source === 'string') source = fs.createReadStream(source);
  queue.defer((callback) => {
    let data = null;
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
    eos(source.pipe(this.extract), (err) => {
      if (data) return;
      cleanup();
      callback(err);
    });
  });

  // start processing
  queue.await((err) => {
    fifoRemove(this.processing, setup);
    if (this.done || cancelled) return; // done
    err ? this.end(err) : this.push(nextEntry.bind(null, null));
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
