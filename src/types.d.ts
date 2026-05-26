export { DirectoryEntry, type ExtractOptions, LinkEntry, Lock, SymbolicLinkEntry } from 'extract-base-iterator';
export { default as FileEntry } from './FileEntry.ts';
import type { DirectoryEntry, LinkEntry, SymbolicLinkEntry } from 'extract-base-iterator';
import type FileEntry from './FileEntry.ts';
export type Entry = DirectoryEntry | FileEntry | LinkEntry | SymbolicLinkEntry;
export type EntryCallback = (error?: Error, result?: IteratorResult<Entry>) => void;
