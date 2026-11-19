/** Download and verify persistent test artifacts. Node 0.8 compatible. */

import getFile from 'get-file-compat';
import path from 'path';
import { stagedCache, verifySha256 } from 'staged-cache';
import url from 'url';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
export const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'shared', 'tar-iterator');

export interface DownloadedArtifact {
  url: string;
  filename: string;
  sha256: string;
}

/** Download an artifact into the shared cache; a valid copy is reused, anything else is built, verified and renamed into place. */
export function downloadFixture(artifact: DownloadedArtifact, callback: (err?: Error | null, filepath?: string) => void): void {
  stagedCache(
    getFixturePath(artifact.filename),
    {
      verify: verifySha256(artifact.sha256),
      build: (staging: string, cb: (err?: Error | null) => void) => {
        getFile(artifact.url, staging, (err: Error | null, res?: { statusCode?: number }) => {
          cb(err || (res && res.statusCode !== 200 ? new Error(`HTTP ${res.statusCode}: ${artifact.url}`) : null));
        });
      },
    },
    callback
  );
}

/** The path a cached fixture is stored at. */
export function getFixturePath(filename: string): string {
  return path.join(CACHE_DIR, filename);
}
