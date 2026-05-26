import { type FileAttributes, FileEntry, type Lock, type NoParamCallback } from 'extract-base-iterator';
import type { ExtractOptions } from './types.ts';
export default class TarFileEntry extends FileEntry {
  private lock;
  private stream;
  constructor(attributes: FileAttributes, stream: NodeJS.ReadableStream, lock: Lock);
  create(dest: string, callback: NoParamCallback): void;
  create(dest: string, options: ExtractOptions, callback: NoParamCallback): void;
  create(dest: string, options?: ExtractOptions): Promise<boolean>;
  _writeFile(fullPath: string, _options: ExtractOptions, callback: NoParamCallback): void;
  destroy(): void;
}
