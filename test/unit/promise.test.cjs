require('../lib/polyfills.cjs');
const assert = require('assert');
const rimraf2 = require('rimraf2');
const mkdirp = require('mkdirp-classic');
const path = require('path');
const fs = require('fs');
const Queue = require('queue-cb');
const bz2 = require('unbzip2-stream');
const zlib = require('zlib');

const TarIterator = require('tar-iterator');
const validateFiles = require('../lib/validateFiles.cjs');

const constants = require('../lib/constants.cjs');
const TMP_DIR = constants.TMP_DIR;
const TARGET = constants.TARGET;
const DATA_DIR = constants.DATA_DIR;

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

describe('promise', () => {
  (() => {
    // patch and restore promise
    const root = typeof global !== 'undefined' ? global : window;
    let rootPromise;
    before(() => {
      rootPromise = root.Promise;
      root.Promise = require('pinkie-promise');
    });
    after(() => {
      root.Promise = rootPromise;
    });
  })();

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
        (entry) => {
          entry.destroy();
        },
        (err) => {
          if (err) return done(err.message);
          assert.ok(!iterator.extract);
          done();
        }
      );
    });

    it('extract - no strip - concurrency 1', (done) => {
      const options = { now: new Date(), concurrency: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract - no strip - concurrency Infinity', (done) => {
      const options = { now: new Date(), concurrency: Infinity };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract - stream', (done) => {
      const options = { now: new Date() };
      const source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar'));
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract - stream bz2', (done) => {
      const options = { now: new Date() };
      let source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar.bz2'));
      source = source.pipe(bz2());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract - stream gz', (done) => {
      const options = { now: new Date() };
      let source = fs.createReadStream(path.join(DATA_DIR, 'fixture.tar.gz'));
      source = source.pipe(zlib.createUnzip());
      extract(new TarIterator(source), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract - strip 1', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);
          done();
        });
      });
    });

    it('extract multiple times', (done) => {
      const options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
        if (err) return done(err.message);

        validateFiles(options, 'tar', (err) => {
          if (err) return done(err.message);

          extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, (err) => {
            assert.ok(err);

            extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, { force: true, ...options }, (err) => {
              if (err) return done(err.message);

              validateFiles(options, 'tar', (err) => {
                if (err) return done(err.message);
                done();
              });
            });
          });
        });
      });
    });
  });

  // TODO: investigate the throwing and promise race condition in node 0.8
  describe.skip('unhappy path', () => {
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
