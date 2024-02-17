const once = require('once');
const path = require('path');
const compact = require('lodash.compact');
const assign = require('just-extend');

const BaseIterator = require('extract-base-iterator').default;
const DirectoryEntry = BaseIterator.DirectoryEntry;
const FileEntry = require('./FileEntry');
const LinkEntry = BaseIterator.LinkEntry;
const SymbolicLinkEntry = BaseIterator.SymbolicLinkEntry;

function nextEntry(next, iterator, callback) {
  const extract = iterator.extract;
  if (!extract) return callback(new Error('Extract missing'));

  const _callback = callback;
  callback = once(function callback(err, entry, next) {
    extract.removeListener('entry', onEntry);
    extract.removeListener('error', onError);
    extract.removeListener('finish', onEnd);

    // keep processing
    if (entry) iterator.stack.push(nextEntry.bind(null, next));

    // use null to indicate iteration is complete
    _callback(err, err || !entry ? null : entry);
  });

  const onError = callback;
  const onEnd = callback.bind(null, null);
  const onEntry = function onEntry(header, stream, next) {
    if (iterator.done) return callback(null, null, next);

    const attributes = assign({}, header);
    attributes.path = compact(header.name.split(path.sep)).join(path.sep);
    attributes.mtime = new Date(attributes.mtime);

    switch (attributes.type) {
      case 'directory':
        stream.resume(); // drain stream
        return callback(null, new DirectoryEntry(attributes), next);
      case 'symlink':
        stream.resume(); // drain stream
        attributes.linkpath = header.linkname;
        return callback(null, new SymbolicLinkEntry(attributes), next);
      case 'link':
        stream.resume(); // drain stream
        attributes.linkpath = header.linkname;
        return callback(null, new LinkEntry(attributes), next);
      case 'file':
        return callback(null, new FileEntry(attributes, stream, iterator.lock), next);
    }

    stream.resume(); // drain stream
    return callback(new Error(`Unrecognized entry type: ${attributes.type}`), null, next);
  };

  extract.on('entry', onEntry);
  extract.on('error', onError);
  extract.on('finish', onEnd);
  if (next) next();
}

module.exports = nextEntry;
