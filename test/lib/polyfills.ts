if (!Buffer.from) {
  // @ts-ignore
  Buffer.from = function bufferFrom(data, encoding) {
    return new Buffer(data, encoding);
  };
}
