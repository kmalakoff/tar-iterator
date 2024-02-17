require('../lib/patch');
const assert = require('assert');
const rimraf = require('rimraf');
const mkpath = require('mkpath');
const path = require('path');
const assign = require('just-extend');

const TarIterator = require('tar-iterator');
const validateFiles = require('../lib/validateFiles');

const constants = require('../lib/constants');
const TMP_DIR = constants.TMP_DIR;
const TARGET = constants.TARGET;
const DATA_DIR = constants.DATA_DIR;

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

describe('asyncIterator', () => {
  beforeEach((callback) => {
    rimraf(TMP_DIR, (err) => {
      if (err && err.code !== 'EEXIST') return callback(err);
      mkpath(TMP_DIR, callback);
    });
  });

  describe('happy path', () => {
    it('extract - no strip', async () => {
      const options = { now: new Date() };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });

    it('extract - strip 1', async () => {
      const options = { now: new Date(), strip: 1 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });

    it('extract multiple times', async () => {
      const options = { now: new Date(), strip: 1 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        await validateFiles(options, 'tar');
        try {
          await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
          assert.ok(false);
        } catch (err) {
          assert.ok(err);
        }
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, assign({ force: true }, options));
        await validateFiles(options, 'tar');
      } catch (err) {
        assert.ok(!err);
      }
    });
  });

  describe('unhappy path', () => {
    it('should fail with too large strip', async () => {
      const options = { now: new Date(), strip: 2 };
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        assert.ok(false);
      } catch (err) {
        assert.ok(!!err);
      }
    });
  });
});
