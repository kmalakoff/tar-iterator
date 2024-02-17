const BaseIterator = require('extract-base-iterator').default;

module.exports = require('./TarIterator');
module.exports.DirectoryEntry = BaseIterator.DirectoryEntry;
module.exports.FileEntry = require('./FileEntry');
module.exports.LinkEntry = BaseIterator.LinkEntry;
module.exports.SymbolicLinkEntry = BaseIterator.SymbolicLinkEntry;
