if (!Buffer.from) {
  Buffer.from = function bufferFrom(data, encoding) {
    // eslint-disable-next-line n/no-deprecated-api
    return new Buffer(data, encoding);
  };
}
