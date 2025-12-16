import Iterator from 'fs-iterator';
import statsSpys from 'fs-stats-spys';

export interface Stats {
  dirs: number;
  files: number;
  links: number;
}

export default function getStats(dir: string, callback?: (err: Error | null, stats?: Stats) => void): undefined | Promise<Stats> {
  if (typeof callback === 'function') {
    const spys = statsSpys();
    new Iterator(dir, { lstat: true }).forEach(
      (entry): undefined => {
        spys(entry.stats);
      },
      (err): undefined => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, {
          dirs: spys.dir.callCount,
          files: spys.file.callCount,
          links: spys.link.callCount,
        });
      }
    );
  } else {
    return new Promise((resolve, reject) => {
      getStats(dir, (err, stats) => {
        if (err) reject(err);
        else resolve(stats as Stats);
      });
    });
  }
}
