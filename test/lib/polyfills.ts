if (!Buffer.from) {
  // @ts-expect-error
  Buffer.from = function bufferFrom(data, encoding) {
    return new Buffer(data, encoding);
  };
}
