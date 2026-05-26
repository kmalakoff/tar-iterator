declare module 'mkdirp-classic' {
  function mkdirp(dir: string, callback: (err: Error | null) => void): void;
  namespace mkdirp {
    function sync(dir: string): void;
  }
  export = mkdirp;
}

declare module 'pinkie-promise' {
  const Pinkie: PromiseConstructor;
  export = Pinkie;
}
