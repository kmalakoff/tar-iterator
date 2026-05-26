import type { CallFn } from 'call-once-fn';
import once from 'call-once-fn';
import { type DirectoryAttributes, DirectoryEntry, type FileAttributes, type LinkAttributes, LinkEntry, type Lock, normalizePath, SymbolicLinkEntry } from 'extract-base-iterator';
import FileEntry from './FileEntry.ts';
import type Iterator from './TarIterator.ts';
import type { TarHeader } from './tar/headers.ts';

import type { Entry, EntryCallback } from './types.ts';

export type TarNext = () => void;
export type NextCallback = (error?: Error | null, entry?: Entry, next?: TarNext) => void;

export default function nextEntry(next: TarNext, iterator: Iterator, callback: EntryCallback): void {
  if (!iterator.lock || iterator.isDone()) {
    return callback(undefined, { done: true, value: undefined as unknown as Entry });
  }

  const extract = iterator.extract;
  if (!extract) return callback(new Error('Extract missing'));

  const nextCallback = once(((err?: Error | null, entry?: Entry, next?: TarNext) => {
    extract.removeListener('entry', onEntry);
    extract.removeListener('error', onError);
    extract.removeListener('finish', onEnd);

    if (entry) iterator.push(nextEntry.bind(null, next as TarNext) as unknown as Parameters<typeof iterator.push>[0]);

    process.nextTick(() => {
      err ? callback(err) : callback(undefined, entry ? { done: false, value: entry } : { done: true, value: undefined as unknown as Entry });
    });
  }) as unknown as CallFn) as unknown as NextCallback;

  const onError = (err: Error) => nextCallback(err);
  const onEnd = () => nextCallback();
  const onEntry = function onEntry(header: TarHeader, stream: NodeJS.ReadableStream, next: TarNext) {
    if (!iterator.lock || iterator.isDone()) {
      stream.resume();
      return nextCallback(undefined, undefined, next);
    }

    const entryPath = normalizePath(header.name);
    const mtime = +header.mtime;
    const mode = header.mode;

    switch (header.type) {
      case 'directory':
        stream.resume();
        return nextCallback(undefined, new DirectoryEntry({ ...header, mode, mtime: header.mtime, path: entryPath } as unknown as DirectoryAttributes), next);
      case 'symlink': {
        stream.resume();
        return nextCallback(undefined, new SymbolicLinkEntry({ ...header, mode, mtime, path: entryPath, linkpath: header.linkname ?? '' } as unknown as LinkAttributes), next);
      }
      case 'link': {
        stream.resume();
        return nextCallback(undefined, new LinkEntry({ ...header, mode, mtime, path: entryPath, linkpath: header.linkname ?? '' } as unknown as LinkAttributes), next);
      }
      case 'file': {
        return nextCallback(undefined, new FileEntry({ ...header, mode, mtime, path: entryPath } as unknown as FileAttributes, stream, iterator.lock as Lock), next);
      }
    }

    stream.resume();
    return nextCallback(new Error(`Unrecognized entry type: ${header.type}`), undefined, next);
  };

  extract.on('entry', onEntry as (...args: unknown[]) => void);
  extract.on('error', onError);
  extract.on('finish', onEnd);

  if (next) {
    next();
  } else {
    extract.resume();
  }
}
