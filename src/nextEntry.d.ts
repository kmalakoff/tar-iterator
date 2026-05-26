import type Iterator from './TarIterator.ts';
import type { Entry, EntryCallback } from './types.ts';
export type TarNext = () => void;
export type NextCallback = (error?: Error, entry?: Entry, next?: TarNext) => void;
export default function nextEntry(next: TarNext, iterator: Iterator, callback: EntryCallback): void;
