import path from 'path';
import once from 'call-once-fn';
import compact from 'lodash.compact';

import { DirectoryEntry, LinkEntry, SymbolicLinkEntry } from 'extract-base-iterator';
import FileEntry from './FileEntry.js';

import type { AbstractTarIterator, Entry, EntryCallback } from './types.js';

export type TarNext = () => undefined;
export type NextCallback = (error?: Error, entry?: Entry, next?: TarNext) => undefined;

export default function nextEntry(next: TarNext, iterator: AbstractTarIterator, callback: EntryCallback): undefined {
  const extract = iterator.extract;
  if (!extract) return callback(new Error('Extract missing'));

  const nextCallback = once((err?: Error, entry?: Entry, next?: TarNext) => {
    extract.removeListener('entry', onEntry);
    extract.removeListener('error', onError);
    extract.removeListener('finish', onEnd);

    // keep processing
    if (entry) iterator.stack.push(nextEntry.bind(null, next));

    err ? callback(err) : callback(null, entry ? { done: false, value: entry } : { done: true, value: null });
  }) as NextCallback;

  const onError = callback;
  const onEnd = callback.bind(null, null);
  const onEntry = function onEntry(header, stream, next: TarNext) {
    if (iterator.done) return nextCallback(null, null, next);

    const attributes = { ...header };
    attributes.path = compact(header.name.split(path.sep)).join(path.sep);
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
  if (next) next();
}
