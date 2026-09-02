export { DirectoryEntry, type Entry, type ExtractOptions, LinkEntry, SymbolicLinkEntry } from 'extract-base-iterator';
export { default as FileEntry } from './FileEntry.ts';
export type { default as Lock } from './lib/Lock.ts';

import type { Entry } from 'extract-base-iterator';

export type EntryCallback = (error?: Error, result?: IteratorResult<Entry>) => undefined;
