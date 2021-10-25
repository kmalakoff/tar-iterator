var BaseIterator = require('extract-base-iterator');

module.exports = require('./lib/TarIterator');
module.exports.DirectoryEntry = BaseIterator.DirectoryEntry;
module.exports.FileEntry = require('./lib/FileEntry');
module.exports.LinkEntry = BaseIterator.LinkEntry;
module.exports.SymbolicLinkEntry = BaseIterator.SymbolicLinkEntry;
