import '../lib/polyfills.ts';
import assert from 'assert';
import fs from 'fs';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Queue from 'queue-cb';
import rimraf2 from 'rimraf2';
// @ts-ignore
import TarIterator from 'tar-iterator';
import bz2 from 'unbzip2-stream';
import zlib from 'zlib';
import { DATA_DIR, TARGET, TMP_DIR } from '../lib/constants.ts';
import validateFiles from '../lib/validateFiles.ts';

function extract(iterator, dest, options, callback) {
  const links = [];
  iterator.forEach(
    (entry, callback) => {
      if (entry.type === 'link') {
        links.unshift(entry);
        callback();
      } else if (entry.type === 'symlink') {
        links.push(entry);
        callback();
      } else entry.create(dest, options, callback);
    },
    { callbacks: true, concurrency: options.concurrency },
    (err) => {
      if (err) return callback(err);

      // create links after directories and files
      const queue = new Queue(1);
      for (let index = 0; index < links.length; index++) {
        const entry = links[index];
        queue.defer(entry.create.bind(entry, dest, options));
      }
      queue.await(callback);
    }
  );
}

describe('callback', () => {
  beforeEach((callback) => {
    rimraf2(TMP_DIR, { disableGlob: true }, () => {
      mkdirp(TMP_DIR, callback);
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
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
            return;
          }
          done();
        });
      });
    });

    it('extract - stream bz2', (done) => {
      const options = { now: new Date() };
      let source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar.bz2'));
      source = source.pipe(bz2());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) {
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
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
          done(err.message);
          return;
        }

        validateFiles(options, 'tar', (err) => {
          if (err) {
            done(err.message);
            return;
          }

          extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
            assert.ok(err);

            extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, { force: true, ...options }, (err) => {
              if (err) {
                done(err.message);
                return;
              }

              validateFiles(options, 'tar', (err) => {
                if (err) {
                  done(err.message);
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
