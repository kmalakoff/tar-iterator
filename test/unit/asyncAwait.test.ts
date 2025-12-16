import assert from 'assert';
import { safeRm } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Pinkie from 'pinkie-promise';
import TarIterator from 'tar-iterator';
import url from 'url';

import { getFixture } from '../lib/fixtures.ts';
import getStats from '../lib/getStats.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', '.tmp');
const TARGET = path.join(TMP_DIR, 'target');

const fixture = getFixture('fixture.tar');

async function extract(iterator, dest, options) {
  const links = [];
  let value = await iterator.next();
  while (!value.done) {
    const entry = value.value;
    if (entry.type === 'link') links.unshift(entry);
    else if (entry.type === 'symlink') links.push(entry);
    else await entry.create(dest, options);
    value = await iterator.next();
  }

  // create links then symlinks after directories and files
  for (const entry of links) await entry.create(dest, options);
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

async function verify(options) {
  const statsPath = options.strip ? TARGET : path.join(TARGET, 'data');
  const actual = await getStats(statsPath);
  assert.deepEqual(actual, fixture.expected);
}

describe('asyncAwait', () => {
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
    safeRm(TARGET, () => {
      mkdirp(TARGET, callback);
    });
  });

  afterEach((callback) => {
    safeRm(TARGET, callback);
  });

  describe('happy path', () => {
    it('extract - no strip - concurrency 1', async () => {
      const options = { now: new Date(), concurrency: 1 };
      await extract(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
    });

    it('extract - no strip - concurrency 4', async () => {
      const options = { now: new Date(), concurrency: 4 };
      await extract(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
    });

    it('extract - no strip - concurrency Infinity', async () => {
      const options = { now: new Date(), concurrency: Infinity };
      await extract(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
    });

    it('extract - no strip - forEach', async () => {
      const options = { now: new Date(), concurrency: Infinity };
      await extractForEach(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
    });

    it('extract - strip 1', async () => {
      const options = { now: new Date(), strip: 1 };
      await extract(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
    });

    it('extract multiple times', async () => {
      const options = { now: new Date(), strip: 1 };
      await extract(new TarIterator(fixture.path), TARGET, options);
      await verify(options);
      try {
        await extract(new TarIterator(fixture.path), TARGET, options);
        assert.ok(false);
      } catch (err) {
        assert.ok(err);
      }
      await extract(new TarIterator(fixture.path), TARGET, { force: true, ...options });
      await verify(options);
    });
  });

  describe('unhappy path', () => {
    it('should fail with too large strip', async () => {
      const options = { now: new Date(), strip: 2 };
      try {
        await extract(new TarIterator(fixture.path), TARGET, options);
        assert.ok(false);
      } catch (err) {
        assert.ok(!!err);
      }
    });
  });
});
