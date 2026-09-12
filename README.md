# tar-iterator

Read entries from a tar archive through an iterator. Give it a file path or a readable stream. Use a decompression transform before the iterator for compressed tar input.

```bash
npm install tar-iterator
```

## Read entries

```js
var TarIterator = require('tar-iterator');

(async function () {
  var iterator = new TarIterator('/path/to/archive.tar');

  try {
    for await (var entry of iterator) {
      console.log(entry.type, entry.path);
    }
  } finally {
    iterator.destroy();
  }
})();
```

Each entry has a `type` and a `create(destination[, options])` method. Directory, file, hard-link, and symbolic-link entries can be created after iteration. Create links after files and directories when extracting an archive.

To read from a stream, pass a readable stream instead of the path:

```js
var fs = require('fs');
var TarIterator = require('tar-iterator');
var iterator = new TarIterator(fs.createReadStream('/path/to/archive.tar'));
```

The package also exports `TarErrorCode`, `TarCodedError`, `FileEntry`, and extraction types.
