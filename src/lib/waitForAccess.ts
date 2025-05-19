import fs from 'fs';

export default function waitForAccess(fullPath, callback) {
  fs.stat(fullPath, (err) => {
    if (err) return waitForAccess(fullPath, callback);
    callback();
  });
}
