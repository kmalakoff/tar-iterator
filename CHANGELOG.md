# Changelog

All notable changes to tar-iterator are documented here.

## [3.3.14] - 2026-11-23

### Fixed

- Failed entry extraction now closes the output file before reporting the source error, allowing immediate cleanup on Windows.

## [3.3.13] - 2026-11-23

### Fixed

- Source stream read errors arriving after the first chunk (including mid-stream decompression errors such as `zlib.createUnzip()`) are now propagated to active `FileEntry.create()` callbacks and `TarIterator.forEach()` instead of hanging indefinitely.
- Empty 0-byte streams and files now complete cleanly with zero entries instead of hanging.

### Changed

- Raised minimum `extract-base-iterator` dependency to `^3.5.0`.
