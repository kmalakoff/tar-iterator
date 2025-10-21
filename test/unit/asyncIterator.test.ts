import '../lib/polyfills.ts';
import assert from 'assert';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Pinkie from 'pinkie-promise';
import rimraf2 from 'rimraf2';

import TarIterator from 'tar-iterator';
import { DATA_DIR, TARGET, TMP_DIR } from '../lib/constants.ts';
import validateFiles from '../lib/validateFiles.ts';

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
  if (typeof Symbol === 'undefined' || !Symbol.asyncIterator) return;
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
    rimraf2(TMP_DIR, { disableGlob: true }, () => {
      mkdirp(TMP_DIR, callback);
    });
  });

  describe('happy path', () => {
    it('extract - no strip', async () => {
      const options = { now: new Date() };
      await extract(new TarIterator(path.join(DATA_DIR, 'fixture.tar')), TARGET, options);
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
