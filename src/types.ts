export type { ExtractOptions } from 'extract-base-iterator';

export interface LockT {
  iterator?: unknown;
  err?: Error;
  retain: () => void;
  release: () => void;
}
