require('../lib/patch');
var assert = require('assert');
var rimraf = require('rimraf');
var mkpath = require('mkpath');
var path = require('path');

var TarIterator = require('../..');
var validateFiles = require('../lib/validateFiles');

var constants = require('../lib/constants');
var TMP_DIR = constants.TMP_DIR;
var TARGET = constants.TARGET;
var DATA_DIR = constants.DATA_DIR;

async function extract(iterator, dest, options) {
  const links = [];
  for await (const entry of iterator) {
    if (entry.type === 'link') links.unshift(entry);
    else if (entry.type === 'symlink') links.push(entry);
    else await entry.create(dest, options);
  }

  // create links then symlinks after directories and files
  for (const entry of links) await entry.create(dest, options);
}

describe('asyncIterator', function () {
  beforeEach(function (callback) {
    rimraf(TMP_DIR, function (err) {
      if (err && err.code !== 'EEXIST') return callback(err);
      mkpath(TMP_DIR, callback);
    });
  });

  describe('happy path', function () {
    it('extract - no strip', async function () {
      var options = { now: new Date() };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });

    it('extract - strip 1', async function () {
      var options = { now: new Date(), strip: 1 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });

    it('extract multiple times', async function () {
      var options = { now: new Date(), strip: 1 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });
  });

  describe('unhappy path', function () {
    it('should fail with too large strip', async function () {
      var options = { now: new Date(), strip: 2 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        assert.ok(false);
      } catch (err) {
        assert.ok(!!err);
      }
    });
  });
});
