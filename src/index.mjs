import BaseIterator from 'extract-base-iterator';
import TarIterator from './TarIterator.cjs';

TarIterator.DirectoryEntry = BaseIterator.DirectoryEntry;
TarIterator.FileEntry = require('./FileEntry.cjs');
TarIterator.LinkEntry = BaseIterator.LinkEntry;
TarIterator.SymbolicLinkEntry = BaseIterator.SymbolicLinkEntry;
export default TarIterator;
