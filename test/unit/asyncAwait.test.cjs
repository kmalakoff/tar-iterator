require('../lib/polyfills.cjs');
const assert = require('assert');
const rimraf2 = require('rimraf2');
const mkdirp = require('mkdirp-classic');
const path = require('path');

const TarIterator = require('tar-iterator');
const validateFiles = require('../lib/validateFiles.cjs');

const constants = require('../lib/constants.cjs');
const TMP_DIR = constants.TMP_DIR;
const TARGET = constants.TARGET;
const DATA_DIR = constants.DATA_DIR;

async function extract(iterator, dest, options) {
  const links = [];
  const symlinks = [];
  let value = await iterator.next();
  while (!value.done) {
    const entry = value.value;
    if (entry.type === 'link') links.push(entry);
    else if (entry.type === 'symlink') symlinks.push(entry);
    else await entry.create(dest, options);
    value = await iterator.next();
  }

  // create links then symlinks after directories and files
  for (const entry of links) await entry.create(dest, options);
  for (const entry of symlinks) await entry.create(dest, options);
}

async function extractForEach(iterator, dest, options) {
  const links = [];
  await iterator.forEach(
    async (entry) => {
      if (entry.type === 'link') links.unshift(entry);
      else if (entry.type === 'symlink') links.push(entry);
      else await entry.create(dest, options);
    },
    { concurrency: options.concurrency }
  );

  // create links then symlinks after directories and files
  for (const entry of links) await entry.create(dest, options);
}

describe('asyncAwait', () => {
  if (typeof Symbol === 'undefined' || !Symbol.asyncIterator) return;
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
    it('extract - no strip - concurrency 1', async () => {
      const options = { now: new Date(), concurrency: 1 };
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
      await validateFiles(options, 'tar');
    });

    it('extract - no strip - concurrency Infinity', async () => {
      const options = { now: new Date(), concurrency: Infinity };
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
      await validateFiles(options, 'tar');
    });

    it('extract - no strip - forEach', async () => {
      const options = { now: new Date(), concurrency: Infinity };
      await extractForEach(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
      await validateFiles(options, 'tar');
    });

    it('extract - strip 1', async () => {
      const options = { now: new Date(), strip: 1 };
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
      await validateFiles(options, 'tar');
    });

    it('extract multiple times', async () => {
      const options = { now: new Date(), strip: 1 };
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
      await validateFiles(options, 'tar');
      try {
        await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
        assert.ok(false);
      } catch (err) {
        assert.ok(err);
      }
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, { force: true, ...options });
      await validateFiles(options, 'tar');
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
