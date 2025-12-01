# Future Enhancements

This document tracks features that have been researched but deferred for later implementation. These features are waiting on user requests before being prioritized.

## Multi-Volume Archive Support

**Status:** Partial support - Types V and D are emitted as entries. Type M (multi-volume continuation) is deferred.

### Overview

Multi-volume archives split large files across multiple tape/disk volumes. This is a legacy GNU tar feature primarily used for tape backups.

### Entry Types

| Type Flag | ASCII | Type Name | Description |
|-----------|-------|-----------|-------------|
| M | 77 | gnu-multivol | Multi-volume continuation - file continues from previous volume |
| V | 86 | gnu-volume-header | Volume header - metadata about the volume |
| D | 68 | gnu-dumpdir | Directory dump - list of filenames for incremental backups |

### Implementation Complexity

**Estimated Effort:** 12-16 hours

**Why It's Hard:**

1. **API Redesign Required**: Current API assumes single-stream input. Multi-volume requires:
   ```javascript
   // Current API (single stream)
   const iterator = new TarIterator(stream);

   // Required API (multi-volume)
   const iterator = new TarIterator();
   iterator.addVolume(volume1Stream);
   iterator.addVolume(volume2Stream);
   // entries span volumes seamlessly
   ```

2. **Stateful Processing**: Must track:
   - Which file is partially extracted
   - How many bytes remain
   - Buffer partial data between volumes

3. **Volume Ordering**: User must provide volumes in correct order; no way to auto-detect sequence

### Current Implementation Status

1. **Type V (Volume Header)** - ✅ Basic support implemented
   - Parsed and emitted as entry with type `gnu-volume-header`
   - Consumers can filter or process as needed
   - Advanced: Could add volume label parsing or info events (deferred)

2. **Type D (Directory Dump)** - ✅ Basic support implemented
   - Parsed and emitted as entry with type `gnu-dumpdir`
   - File content contains newline-separated filenames
   - Used for GNU incremental backups (`tar --listed-incremental`)
   - Advanced: Could parse content into structured data (deferred)

3. **Type M (Continuation)** - Hard (8-16 hours)
   - Indicates file data continues from previous volume
   - Header contains `offset` field (bytes already extracted)
   - Requires:
     - New `addVolume()` API method
     - State tracking between volumes
     - Buffer management for partial files
     - Error handling for missing/out-of-order volumes

### Why It Was Cut

- **No major Node.js tar library implements this** (tar-stream, node-tar, archiver all skip it)
- **Extremely rare in practice** - tape backups are legacy, modern storage doesn't need splitting
- **Significant API complexity** for minimal user benefit
- **No user requests** for this feature to date

### References

- [GNU tar Multi-Volume Archives](https://www.gnu.org/software/tar/manual/html_node/Multi_002dVolume-Archives.html)
- [GNU tar Extensions](https://www.gnu.org/software/tar/manual/html_node/Extensions.html)

---

## PAX Sparse Format (Versions 0.0, 0.1, 1.0)

**Status:** Partially implemented in v3.4.0 (old GNU format only)

### Overview

PAX extended headers can encode sparse file information in multiple format versions.

### Format Versions

**Version 0.0** (GNU tar 1.14-1.15.1):
- Sparse map in PAX attributes: `GNU.sparse.offset`, `GNU.sparse.numbytes`
- Multiple attribute pairs for each sparse region

**Version 0.1**:
- Similar to 0.0 but with improved handling

**Version 1.0** (GNU tar 1.15.92+):
- Sparse map stored as text prefix in file data itself
- Format: `<count>\n<offset>\n<size>\n<offset>\n<size>\n...`
- More portable, extractable by non-GNU tar

### Implementation Complexity

**Estimated Effort:** 2-4 hours (after old GNU format is done)

### Why Deferred

- Old GNU sparse format (header bytes 386-503) covers most real-world cases
- PAX sparse is less common
- Can be added incrementally if users request it

---

## Comparison: Node.js TAR Library Support

Research conducted November 2025 comparing sparse/multi-volume support:

| Library | Sparse Files | Multi-Volume | Notes |
|---------|--------------|--------------|-------|
| tar-stream | No | No | Issue #63 marked "completed" but no code |
| node-tar (npm tar) | No | No | Focuses on POSIX compliance |
| tar-fs | No | No | Uses tar-stream internally |
| archiver | No | No | Archive creation focused |
| **tar-iterator** | Yes (v3.4.0) | No | Old GNU format, PAX deferred |

**Conclusion:** Implementing even basic sparse support makes tar-iterator more capable than all other Node.js tar libraries for this edge case.

---

## How to Request These Features

If you need multi-volume or advanced PAX sparse support:

1. Open an issue at the repository describing your use case
2. Provide sample tar files if possible
3. Explain why existing workarounds don't work for you

User requests help prioritize development effort on features that provide real value.
