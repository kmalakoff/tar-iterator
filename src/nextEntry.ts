import once from 'call-once-fn';
import { DirectoryEntry, LinkEntry, SymbolicLinkEntry } from 'extract-base-iterator';
import path from 'path';
import FileEntry from './FileEntry.ts';
import type Iterator from './TarIterator.ts';

import type { Entry, EntryCallback } from './types.ts';

// Node 0.8 compatible setImmediate (setImmediate was added in Node 0.10)
const _setImmediate =
  typeof setImmediate === 'function'
    ? setImmediate
    : typeof process !== 'undefined' && typeof process.nextTick === 'function'
      ? process.nextTick
      : function setImmediateFallback(fn: () => void) {
          setTimeout(fn, 0);
        };

export type TarNext = () => undefined;
export type NextCallback = (error?: Error, entry?: Entry, next?: TarNext) => undefined;

export default function nextEntry(next: TarNext, iterator: Iterator, callback: EntryCallback): undefined {
  // Guard: bail early if iterator already ended
  if (!iterator.lock || iterator.isDone()) {
    return callback(null, { done: true, value: null });
  }

  const extract = iterator.extract;
  if (!extract) return callback(new Error('Extract missing'));

  const nextCallback = once((err?: Error, entry?: Entry, next?: TarNext) => {
    extract.removeListener('entry', onEntry);
    extract.removeListener('error', onError);
    extract.removeListener('finish', onEnd);

    // keep processing
    if (entry) iterator.push(nextEntry.bind(null, next));

    // Use setImmediate to defer the callback invocation
    // This ensures proper async behavior with the BaseIterator
    _setImmediate(() => {
      err ? callback(err) : callback(null, entry ? { done: false, value: entry } : { done: true, value: null });
    });
  }) as NextCallback;

  const onError = callback;
  const onEnd = callback.bind(null, null);
  const onEntry = function onEntry(header, stream, next: TarNext) {
    // Guard: skip if iterator already ended (stale lock)
    if (!iterator.lock || iterator.isDone()) {
      stream.resume(); // drain stream
      return nextCallback(null, null, next);
    }

    const attributes = { ...header };
    attributes.path = header.name.split(path.sep).filter(Boolean).join(path.sep);
    attributes.mtime = new Date(attributes.mtime);

    switch (attributes.type) {
      case 'directory':
        stream.resume(); // drain stream
        return nextCallback(null, new DirectoryEntry(attributes), next);
      case 'symlink':
        stream.resume(); // drain stream
        attributes.linkpath = header.linkname;
        return nextCallback(null, new SymbolicLinkEntry(attributes), next);
      case 'link':
        stream.resume(); // drain stream
        attributes.linkpath = header.linkname;
        return nextCallback(null, new LinkEntry(attributes), next);
      case 'file':
        return nextCallback(null, new FileEntry(attributes, stream, iterator.lock), next);
    }

    stream.resume(); // drain stream
    return nextCallback(new Error(`Unrecognized entry type: ${attributes.type}`), null, next);
  };

  extract.on('entry', onEntry);
  extract.on('error', onError);
  extract.on('finish', onEnd);

  // Resume parsing to emit any pending entry
  // For first call (next is null), this triggers the first entry emission
  // For subsequent calls, next() unlocks the parser which then processes the next header
  if (next) {
    next();
  } else {
    // First call - resume to emit any pending entry
    extract.resume();
  }
}
