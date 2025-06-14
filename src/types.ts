export type { default as Lock } from './lib/Lock.js';
export { default as FileEntry } from './FileEntry.js';
export { type Entry, DirectoryEntry, LinkEntry, SymbolicLinkEntry, type ExtractOptions } from 'extract-base-iterator';

import type { AbstractIterator, Entry } from 'extract-base-iterator';
import type { default as Lock } from './lib/Lock.js';
export interface AbstractTarIterator extends AbstractIterator<unknown> {
  lock: Lock;
  extract: NodeJS.WritableStream;
}

export type EntryCallback = (error?: Error, entry?: Entry) => undefined;
