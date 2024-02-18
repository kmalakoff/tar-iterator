import access from 'fs-access-compat';

export default function waitForAccess(fullPath, callback) {
  access(fullPath, (err) => {
    if (err) return waitForAccess(fullPath, callback);
    callback();
  });
}
