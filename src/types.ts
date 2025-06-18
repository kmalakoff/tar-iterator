export { DirectoryEntry, type Entry, type ExtractOptions, LinkEntry, SymbolicLinkEntry } from 'extract-base-iterator';
export { default as FileEntry } from './FileEntry.js';
export type { default as Lock } from './lib/Lock.js';

import type { AbstractIterator, Entry } from 'extract-base-iterator';
import type { default as Lock } from './lib/Lock.js';
export interface AbstractTarIterator extends AbstractIterator<unknown> {
  lock: Lock;
  extract: NodeJS.WritableStream;
}

export type EntryCallback = (error?: Error, result?: IteratorResult<Entry>) => undefined;
