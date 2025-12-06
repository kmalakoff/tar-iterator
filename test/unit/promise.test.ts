import assert from 'assert';
import fs from 'fs';
import { safeRm } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Pinkie from 'pinkie-promise';
import Queue from 'queue-cb';
import TarIterator from 'tar-iterator';
import zlib from 'zlib';
import bz2 from '../lib/bz2-stream.ts';
import { DATA_DIR, TARGET } from '../lib/constants.ts';
import validateFiles from '../lib/validateFiles.ts';

function extract(iterator, dest, options, callback) {
  const links = [];
  iterator
    // biome-ignore lint/suspicious/useIterableCallbackReturn: Not an iterable
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

  describe('happy path', () => {
    it('destroy iterator', () => {
      const iterator = new TarIterator(path.join(DATA_DIR, 'fixture.tar'));
      iterator.destroy();
      assert.ok(true);
    });

    it('destroy entries', (done) => {
      const iterator = new TarIterator(path.join(DATA_DIR, 'fixture.tar'));
      iterator.forEach(
        (entry): undefined => {
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
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract - no strip - concurrency Infinity', (done) => {
      const options = { now: new Date(), concurrency: Infinity };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract - stream', (done) => {
      const options = { now: new Date() };
      const source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar'));
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract - stream bz2', (done) => {
      const options = { now: new Date() };
      const source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar.bz2')).pipe(bz2());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract - stream gz', (done) => {
      const options = { now: new Date() };
      const source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar.gz'));
      const pipleine = source.pipe(zlib.createUnzip());
      extract(new TarIterator(pipleine), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract - strip 1', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }
          done();
        });
      });
    });

    it('extract multiple times', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) {
          done(err);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err);
            return;
          }

          extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
            assert.ok(err);

            extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, { force: true, ...options }, (err) => {
              if (err) {
                done(err);
                return;
              }

              validateFiles(options, 'tar', (err) => {
                if (err) {
                  done(err);
                  return;
                }
                done();
              });
            });
          });
        });
      });
    });
  });

  describe('unhappy path', () => {
    it('should fail with bad path', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar' + 'does-not-exist')), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with bad stream', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(fs.createReadStream(path.join(DATA_DIR, 'fixture.tar' + 'does-not-exist'))), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with too large strip', (done) => {
      const options = { now: new Date(), strip: 2 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        assert.ok(!!err);
        done();
      });
    });
  });
});
