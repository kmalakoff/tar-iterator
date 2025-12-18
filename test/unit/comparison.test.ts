/**
 * Comparison test between native tar and tar-iterator
 *
 * This test downloads a real-world tar file (Node.js distribution) and compares
 * the extracted results between system tar and tar-iterator to verify they
 * produce identical output.
 */

import assert from 'assert';
import { exec as execCallback } from 'child_process';
import fs from 'fs';
import Iterator from 'fs-iterator';
import { rmSync } from 'fs-remove-compat';
import getFile from 'get-file-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import Queue from 'queue-cb';
import TarIterator, { type Entry } from 'tar-iterator';
import url from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', '.tmp');

// Test configuration
const TAR_URL = 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.gz';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const CACHE_PATH = path.join(CACHE_DIR, 'node-v24.12.0-linux-x64.tar.gz');
const TAR_EXTRACT_DIR = path.join(TMP_DIR, 'tar');
const TAR_ITERATOR_EXTRACT_DIR = path.join(TMP_DIR, 'tar-iterator');

/**
 * Interface for file stats collected from directory tree
 */
interface FileStats {
  size: number;
  mode: number;
  mtime: number;
  type: 'directory' | 'file' | 'symlink' | 'other';
}

/**
 * Collect file stats from a directory tree
 * Returns a map of relative paths to their FileStats
 */
function collectStats(dirPath: string, callback: (err: Error | null, stats?: Record<string, FileStats>) => void): void {
  const stats: Record<string, FileStats> = {};

  const iterator = new Iterator(dirPath, { alwaysStat: true, lstat: true });

  iterator.forEach(
    (entry): void => {
      // entry.path is already relative to dirPath
      stats[entry.path] = {
        size: entry.stats.size,
        mode: entry.stats.mode,
        mtime: entry.stats.mtime instanceof Date ? entry.stats.mtime.getTime() : 0,
        type: entry.stats.isDirectory() ? 'directory' : entry.stats.isFile() ? 'file' : entry.stats.isSymbolicLink() ? 'symlink' : 'other',
      };
    },
    { concurrency: 1024 },
    (err) => {
      if (err) {
        callback(err);
      } else {
        callback(null, stats);
      }
    }
  );
}

/**
 * Remove directory if it exists
 */
function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Check if a native tool is available
 */
function checkToolAvailable(checkCmd: string, callback: (available: boolean) => void): void {
  execCallback(checkCmd, (err) => {
    callback(!err);
  });
}

/**
 * Extract using tar-iterator with entry.create() API
 */
function extractWithTarIterator(cachePath: string, destDir: string, options: { now: Date; strip: number }, callback: (err?: Error) => void): void {
  const source = fs.createReadStream(cachePath).pipe(zlib.createUnzip());
  const iterator = new TarIterator(source);
  const links: Entry[] = [];

  iterator.forEach(
    (entry, cb): void => {
      if (entry.type === 'link') {
        links.unshift(entry); // Hard links first
        cb();
      } else if (entry.type === 'symlink') {
        links.push(entry); // Symlinks after hard links
        cb();
      } else {
        entry.create(destDir, options, (err) => {
          cb(err || undefined);
        });
      }
    },
    { callbacks: true },
    (err): void => {
      if (err) return callback(err);

      // Process links after files/directories (hard links first, then symlinks)
      const queue = new Queue(1);
      for (let i = 0; i < links.length; i++) {
        queue.defer(links[i].create.bind(links[i], destDir, options));
      }
      queue.await(callback);
    }
  );
}

describe('Comparison - tar-iterator vs native tar', () => {
  let toolAvailable = false;

  before(function (done) {
    // Increase timeout for this test (downloading and extracting large archive)
    this.timeout(120000);

    // Check if native tar is available
    checkToolAvailable('which tar', (available) => {
      toolAvailable = available;
      if (!available) {
        console.log('    Skipping tar comparison tests - native tar not available');
        done();
        return;
      }

      // Ensure directories exist
      if (!fs.existsSync(CACHE_DIR)) {
        mkdirp.sync(CACHE_DIR);
      }
      if (!fs.existsSync(TMP_DIR)) {
        mkdirp.sync(TMP_DIR);
      }

      // Download tar file if it doesn't exist
      if (!fs.existsSync(CACHE_PATH)) {
        console.log(`Downloading ${TAR_URL}...`);
        getFile(TAR_URL, CACHE_PATH, (err) => {
          if (err) {
            done(err);
            return;
          }
          console.log('Download complete');
          performExtractions(done);
        });
      } else {
        console.log('Using cached tar file');
        performExtractions(done);
      }
    });

    function performExtractions(callback: (err?: Error) => void): void {
      // Clean up previous extractions
      removeDir(TAR_EXTRACT_DIR);
      removeDir(TAR_ITERATOR_EXTRACT_DIR);

      // Extract with native tar
      console.log('Extracting with native tar...');
      execCallback(`cd "${TMP_DIR}" && tar -xzf "${CACHE_PATH}"`, (err) => {
        if (err) return callback(err);

        // Find the extracted directory (should be node-v24.12.0-linux-x64)
        const tarDir = path.join(TMP_DIR, 'node-v24.12.0-linux-x64');
        if (!fs.existsSync(tarDir)) {
          callback(new Error('Native tar should create node-v24.12.0-linux-x64 directory'));
          return;
        }

        // Rename it to TAR_EXTRACT_DIR
        fs.renameSync(tarDir, TAR_EXTRACT_DIR);

        // Extract with tar-iterator
        console.log('Extracting with tar-iterator...');
        const options = { now: new Date(), strip: 1 };
        extractWithTarIterator(CACHE_PATH, TAR_ITERATOR_EXTRACT_DIR, options, (err) => {
          if (err) {
            callback(err);
          } else {
            console.log('Both extractions complete');
            callback();
          }
        });
      });
    }
  });

  it('should produce identical extraction results', function (done) {
    if (!toolAvailable) {
      this.skip();
      return;
    }

    // Collect stats from both directories
    console.log('Collecting stats from native tar extraction...');
    collectStats(TAR_EXTRACT_DIR, (err, statsTar) => {
      if (err) {
        done(err);
        return;
      }

      console.log('Collecting stats from tar-iterator extraction...');
      collectStats(TAR_ITERATOR_EXTRACT_DIR, (err, statsTarIterator) => {
        if (err) {
          done(err);
          return;
        }

        // Find differences
        const differences: string[] = [];

        // Check for files only in native tar
        for (const path in statsTar) {
          if (!(path in statsTarIterator)) {
            differences.push(`File exists in native tar but not in tar-iterator: ${path}`);
          }
        }

        // Check for files only in tar-iterator
        for (const path in statsTarIterator) {
          if (!(path in statsTar)) {
            differences.push(`File exists in tar-iterator but not in native tar: ${path}`);
          }
        }

        // Check for differences in files that exist in both
        for (const path in statsTar) {
          if (path in statsTarIterator) {
            const statTar = statsTar[path];
            const statTarIterator = statsTarIterator[path];

            if (statTar.type !== statTarIterator.type) {
              differences.push(`Type mismatch for ${path}: native=${statTar.type}, tar-iterator=${statTarIterator.type}`);
            }

            if (statTar.size !== statTarIterator.size) {
              differences.push(`Size mismatch for ${path}: native=${statTar.size}, tar-iterator=${statTarIterator.size}`);
            }

            // Check mode (permissions), but allow for minor differences due to umask
            // Use Number() to handle BigInt on older Windows Node versions
            const modeDiff = Math.abs(Number(statTar.mode) - Number(statTarIterator.mode));
            if (modeDiff > 0o22) {
              // Allow up to umask differences (typically 0o022)
              differences.push(`Mode mismatch for ${path}: native=${statTar.mode.toString(8)}, tar-iterator=${statTarIterator.mode.toString(8)}`);
            }
          }
        }

        // Report any differences
        if (differences.length > 0) {
          console.error('\n=== DIFFERENCES FOUND ===');
          for (let i = 0; i < differences.length; i++) {
            console.error(differences[i]);
          }
          console.error('=========================\n');

          done(new Error(`Found ${differences.length} difference(s) between native tar and tar-iterator extraction`));
          return;
        }

        assert.strictEqual(Object.keys(statsTar).length, Object.keys(statsTarIterator).length, 'Should have same number of files');
        done();
      });
    });
  });
});
