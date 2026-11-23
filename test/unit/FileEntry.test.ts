import assert from 'assert';
import { type FileAttributes, Lock, PassThrough } from 'extract-base-iterator';
import { safeRm } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import url from 'url';
import TarFileEntry from '../../src/FileEntry.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', '..', '.tmp', 'file-entry-error');

describe('TarFileEntry', () => {
  beforeEach((done) => {
    safeRm(target, () => mkdirp(target, done));
  });

  afterEach((done) => {
    safeRm(target, done);
  });

  it('waits for output close before reporting a source error during open', (done) => {
    const source = new PassThrough();
    const entry = new TarFileEntry({ path: 'entry.txt', mode: 0o644, mtime: Date.now(), size: 0 } as FileAttributes, source, new Lock());
    const output = path.join(target, 'entry.txt');
    let synchronous = true;

    entry._writeFile(output, {}, (err) => {
      assert.ok(err);
      assert.strictEqual(err.message, 'source failed');
      assert.strictEqual(synchronous, false, 'callback must wait for output close');
      done();
    });
    source.emit('error', new Error('source failed'));
    synchronous = false;
  });
});
