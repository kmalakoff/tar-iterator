/**
 * TAR Format Constants
 *
 * These define the structure of TAR headers per POSIX USTAR specification
 * with GNU and PAX extensions.
 */

// Block sizes
export const HEADER_SIZE = 512;
export const BLOCK_SIZE = 512;

// Header field offsets and sizes (POSIX USTAR format)
export const NAME_OFFSET = 0;
export const NAME_SIZE = 100;
export const MODE_OFFSET = 100;
export const MODE_SIZE = 8;
export const UID_OFFSET = 108;
export const UID_SIZE = 8;
export const GID_OFFSET = 116;
export const GID_SIZE = 8;
export const SIZE_OFFSET = 124;
export const SIZE_SIZE = 12;
export const MTIME_OFFSET = 136;
export const MTIME_SIZE = 12;
export const CHECKSUM_OFFSET = 148;
export const CHECKSUM_SIZE = 8;
export const TYPEFLAG_OFFSET = 156;
export const LINKNAME_OFFSET = 157;
export const LINKNAME_SIZE = 100;
export const MAGIC_OFFSET = 257;
export const MAGIC_SIZE = 6;
export const VERSION_OFFSET = 263;
export const VERSION_SIZE = 2;
export const UNAME_OFFSET = 265;
export const UNAME_SIZE = 32;
export const GNAME_OFFSET = 297;
export const GNAME_SIZE = 32;
export const DEVMAJOR_OFFSET = 329;
export const DEVMAJOR_SIZE = 8;
export const DEVMINOR_OFFSET = 337;
export const DEVMINOR_SIZE = 8;
export const PREFIX_OFFSET = 345;
export const PREFIX_SIZE = 155;

// GNU sparse header fields (within the 512-byte header block)
// The sparse header contains up to 4 sparse entries starting at offset 386
// Each entry is: offset (12 bytes) + numbytes (12 bytes) = 24 bytes
export const SPARSE_OFFSET = 386;
export const SPARSE_ENTRY_SIZE = 24; // Each sparse entry is 24 bytes
export const SPARSE_ENTRY_OFFSET_SIZE = 12;
export const SPARSE_ENTRY_NUMBYTES_SIZE = 12;
export const SPARSE_ENTRIES_IN_HEADER = 4; // Up to 4 entries in main header
export const SPARSE_ISEXTENDED_OFFSET = 482; // 1 byte: 1 if more entries follow
export const SPARSE_REALSIZE_OFFSET = 483; // 12 bytes: actual file size
export const SPARSE_REALSIZE_SIZE = 12;

// GNU sparse extended header (512-byte blocks with more sparse entries)
// Each extended block contains up to 21 sparse entries plus 1 isextended byte
export const SPARSE_EXTENDED_ENTRIES = 21;
export const SPARSE_EXTENDED_ISEXTENDED_OFFSET = 504; // isextended in extended block

// Magic strings as byte arrays (avoiding Buffer.from which doesn't exist in Node 0.8)
// "ustar\0" - POSIX USTAR format
export const USTAR_MAGIC = [117, 115, 116, 97, 114, 0];
// "ustar " (with space) - GNU format
export const GNU_MAGIC = [117, 115, 116, 97, 114, 32];
// " \0" - GNU version
export const GNU_VER = [32, 0];

// ASCII code for '0'
export const ZERO_OFFSET = 48;

// Type flags (numeric values after subtracting ZERO_OFFSET from ASCII)
export const TYPE_FILE = 0; // '0' or '\0'
export const TYPE_LINK = 1; // '1' - hard link
export const TYPE_SYMLINK = 2; // '2' - symbolic link
export const TYPE_CHAR_DEVICE = 3; // '3' - character device
export const TYPE_BLOCK_DEVICE = 4; // '4' - block device
export const TYPE_DIRECTORY = 5; // '5' - directory
export const TYPE_FIFO = 6; // '6' - FIFO (named pipe)
export const TYPE_CONTIGUOUS = 7; // '7' - contiguous file

// GNU extension type flags (ASCII values, not offset)
export const TYPE_GNU_LONG_PATH = 76; // 'L' - GNU long pathname
export const TYPE_GNU_LONG_LINK = 75; // 'K' - GNU long linkname
export const TYPE_GNU_SPARSE = 83; // 'S' - GNU sparse file
export const TYPE_GNU_DUMPDIR = 68; // 'D' - GNU directory dump
export const TYPE_GNU_MULTIVOL = 77; // 'M' - GNU multi-volume continuation
export const TYPE_GNU_VOLHDR = 86; // 'V' - GNU volume header

// PAX extension type flags (ASCII values)
export const TYPE_PAX_HEADER = 120; // 'x' - PAX extended header for next entry
export const TYPE_PAX_GLOBAL = 103; // 'g' - PAX global extended header

// Type name strings
export type TarEntryType = 'file' | 'link' | 'symlink' | 'character-device' | 'block-device' | 'directory' | 'fifo' | 'contiguous-file' | 'gnu-long-path' | 'gnu-long-link-path' | 'gnu-sparse' | 'gnu-dumpdir' | 'gnu-multivol' | 'gnu-volume-header' | 'pax-header' | 'pax-global-header' | null;
