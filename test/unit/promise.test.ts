import assert from 'assert';
import fs from 'fs';
import { safeRm } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Pinkie from 'pinkie-promise';
import Queue from 'queue-cb';
import TarIterator from 'tar-iterator';
import url from 'url';
import zlib from 'zlib';

import bz2 from '../lib/bz2-stream.ts';
import { getFixture } from '../lib/fixtures.ts';
import getStats from '../lib/getStats.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', '.tmp');
const TARGET = path.join(TMP_DIR, 'target');

const fixture = getFixture('fixture.tar');

function extract(iterator, dest, options, callback) {
  const links = [];
  iterator
    .forEach(
      (entry) => {
        if (entry.type === 'link') links.unshift(entry);
        else if (entry.type === 'symlink') links.push(entry);
        else return entry.create(dest, options);
      },
      { concurrency: options.concurrency }
    )
    .then(() => {
      // create links after directories and files
      const queue = new Queue(1);
      for (let index = 0; index < links.length; index++) {
        ((entry) => {
          queue.defer((callback) => {
            entry.create(dest, options).then(callback).catch(callback);
          });
        })(links[index]);
      }
      queue.await(callback);
    })
    .catch(callback);
}

function verify(options, callback) {
  const statsPath = options.strip ? TARGET : path.join(TARGET, 'data');
  getStats(statsPath, (err, actual) => {
    if (err) return callback(err);
    assert.deepEqual(actual, fixture.expected);
    callback();
  });
}

describe('promise', () => {
  (() => {
    // patch and restore promise
    if (typeof global === 'undefined') return;
    const globalPromise = global.Promise;
    before(() => {
      global.Promise = Pinkie;
    });
    after(() => {
      global.Promise = globalPromise;
    });
  })();

  beforeEach((callback) => {
    safeRm(TARGET, () => {
      mkdirp(TARGET, callback);
    });
  });

  afterEach((callback) => {
    safeRm(TARGET, callback);
  });

  describe('happy path', () => {
    it('destroy iterator', () => {
      const iterator = new TarIterator(fixture.path);
      iterator.destroy();
      assert.ok(true);
    });

    it('destroy entries', (done) => {
      const iterator = new TarIterator(fixture.path);
      iterator.forEach(
        (entry): void => {
          entry.destroy();
        },
        (err) => {
          if (err) {
            done(err);
            return;
          }
          assert.ok(!iterator.extract);
          done();
        }
      );
    });

    it('extract - no strip - concurrency 1', (done) => {
      const options = { now: new Date(), concurrency: 1 };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - no strip - concurrency 4', (done) => {
      const options = { now: new Date(), concurrency: 4 };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - no strip - concurrency Infinity', (done) => {
      const options = { now: new Date(), concurrency: Infinity };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - stream', (done) => {
      const options = { now: new Date() };
      const source = fs.createReadStream(fixture.path);
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - stream bz2', (done) => {
      const options = { now: new Date() };
      const bz2Fixture = getFixture('fixture.tar.bz2');
      const source = fs.createReadStream(bz2Fixture.path).pipe(bz2());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - stream gz', (done) => {
      const options = { now: new Date() };
      const gzFixture = getFixture('fixture.tar.gz');
      const source = fs.createReadStream(gzFixture.path).pipe(zlib.createUnzip());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract - strip 1', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        if (err) return done(err);
        verify(options, done);
      });
    });

    it('extract multiple times', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        if (err) return done(err);

        verify(options, (err) => {
          if (err) return done(err);

          extract(new TarIterator(fixture.path), TARGET, options, (err) => {
            assert.ok(err);

            extract(new TarIterator(fixture.path), TARGET, { force: true, ...options }, (err) => {
              if (err) return done(err);
              verify(options, done);
            });
          });
        });
      });
    });
  });

  describe('unhappy path', () => {
    it('should fail with bad path', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(`${fixture.path}does-not-exist`), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with bad stream', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(fs.createReadStream(`${fixture.path}does-not-exist`)), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with too large strip', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(fixture.path), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });
  });
});
