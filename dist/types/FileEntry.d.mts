export default class TarFileEntry {
    constructor(attributes: any, stream: any, lock: any);
    stream: any;
    lock: any;
    create(dest: any, options: any, callback: any): any;
    _writeFile(fullPath: any, _options: any, callback: any): any;
    destroy(): void;
}
