var assert = require('assert');
var rimraf = require('rimraf');
var mkpath = require('mkpath');
var path = require('path');
var fs = require('fs');
var Queue = require('queue-cb');

var TarIterator = require('../..');
var validateFiles = require('../lib/validateFiles');

var constants = require('../lib/constants');
var TMP_DIR = constants.TMP_DIR;
var TARGET = constants.TARGET;
var DATA_DIR = constants.DATA_DIR;

function extract(iterator, dest, options, callback) {
  var links = [];
  iterator.forEach(
    function (entry, callback) {
      if (entry.type === 'link') {
        links.unshift(entry);
        callback();
      } else if (entry.type === 'symlink') {
        links.push(entry);
        callback();
      } else entry.create(dest, options, callback);
    },
    { callbacks: true, concurrency: options.concurrency },
    function (err) {
      if (err) return callback(err);

      // create links after directories and files
      var queue = new Queue(1);
      for (var index = 0; index < links.length; index++) {
        var entry = links[index];
        queue.defer(entry.create.bind(entry, dest, options));
      }
      queue.await(callback);
    }
  );
}

function extractPromise(iterator, dest, options, callback) {
  var links = [];
  iterator
    .forEach(
      function (entry) {
        if (entry.type === 'link') links.unshift(entry);
        else if (entry.type === 'symlink') links.push(entry);
        else return entry.create(dest, options);
      },
      { concurrency: options.concurrency }
    )
    .then(function () {
      // create links after directories and files
      var queue = new Queue(1);
      for (var index = 0; index < links.length; index++) {
        (function (entry) {
          queue.defer(function (callback) {
            entry.create(dest, options).then(callback).catch(callback);
          });
        })(links[index]);
      }
      queue.await(callback);
    })
    .catch(callback);
}

describe('iterator', function () {
  beforeEach(function (callback) {
    rimraf(TMP_DIR, function (err) {
      if (err && err.code !== 'EEXIST') return callback(err);
      mkpath(TMP_DIR, callback);
    });
  });

  describe('happy path', function () {
    it('extract - no strip - concurrency 1', function (done) {
      var options = { now: new Date(), concurrency: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);
          done();
        });
      });
    });

    it('extract - no strip - concurrency Infinity', function (done) {
      var options = { now: new Date(), concurrency: Infinity };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);
          done();
        });
      });
    });

    it('extract - no strip - promise', function (done) {
      if (typeof Promise === 'undefined') return done();

      var options = { now: new Date() };
      extractPromise(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);
          done();
        });
      });
    });

    it('extract - stream', function (done) {
      var options = { now: new Date() };
      extract(new TarIterator(fs.createReadStream(path.join(DATA_DIR, 'fixture.tar'))), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);
          done();
        });
      });
    });

    it('extract - strip 1', function (done) {
      var options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);
          done();
        });
      });
    });

    it('extract multiple times', function (done) {
      var options = { now: new Date(), strip: 1 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!err);

        validateFiles(options, 'tar', function (err) {
          assert.ok(!err);

          extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
            assert.ok(!err);

            validateFiles(options, 'tar', function (err) {
              assert.ok(!err);
              done();
            });
          });
        });
      });
    });
  });

  describe('unhappy path', function () {
    it('should fail with bad path', function (done) {
      var options = { now: new Date(), strip: 2 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar' + 'does-not-exist')), TARGET, options, function (err) {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with bad stream', function (done) {
      var options = { now: new Date(), strip: 2 };
      extract(new TarIterator(fs.createReadStream(path.join(DATA_DIR, 'fixture.tar' + 'does-not-exist'))), TARGET, options, function (err) {
        assert.ok(!!err);
        done();
      });
    });

    it('should fail with too large strip', function (done) {
      var options = { now: new Date(), strip: 2 };
      extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options, function (err) {
        assert.ok(!!err);
        done();
      });
    });
  });
});
