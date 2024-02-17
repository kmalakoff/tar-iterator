if (!Buffer.from) {
  Buffer.from = function bufferFrom(data, encoding) {
    return new Buffer(data, encoding);
  };
}
