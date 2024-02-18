import fs from 'fs';
import eos from 'end-of-stream';
import BaseIterator from 'extract-base-iterator';
import Queue from 'queue-cb';
import tarStream from 'tar-stream-compat';

import Lock from './lib/Lock.mjs';
import fifoRemove from './lib/fifoRemove.mjs';
import nextEntry from './nextEntry.mjs';

export default class TarIterator extends BaseIterator {
  constructor(source, options) {
    super(options);
    this.lock = new Lock();
    this.lock.iterator = this;

    const queue = Queue(1);
    let cancelled = false;
    function setup() {
      cancelled = true;
    }
    this.processing.push(setup);
    this.extract = tarStream.extract();

    queue.defer((callback) => {
      try {
        if (typeof source === 'string') source = fs.createReadStream(source);
      } catch (err) {
        callback(err);
      }

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

  end(err) {
    if (this.lock) {
      this.lock.err = err;
      this.lock.release();
      this.lock = null;
    } else {
      BaseIterator.prototype.end.call(this, err); // call in lock release so end is properly handled
    }
    this.extract = null;
  }
}
