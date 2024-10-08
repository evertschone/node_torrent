# Installation
> `npm install --save @types/parse-torrent`

# Summary
This package contains type definitions for parse-torrent (https://github.com/webtorrent/parse-torrent).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/parse-torrent.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/parse-torrent/index.d.ts)
````ts
/// <reference types="node" />

import MagnetUri = require("magnet-uri");
import * as ParseTorrentFile from "parse-torrent-file";

declare const ParseTorrent: ParseTorrent.ParseTorrent;

declare namespace ParseTorrent {
    interface ParseTorrent {
        (torrent: string): MagnetUri.Instance;
        (torrent: Buffer): MagnetUri.Instance | ParseTorrentFile.Instance;
        (torrent: Instance | MagnetUri.Instance | ParseTorrentFile.Instance): Instance;

        toMagnetURI: typeof MagnetUri.encode;
        toTorrentFile: typeof ParseTorrentFile.encode;

        remote(
            torrent: string | Buffer | Instance | MagnetUri.Instance | ParseTorrentFile.Instance | Blob,
            cb?: (err: Error, torrent?: Instance) => void,
        ): void;
    }

    interface Instance extends MagnetUri.Instance, ParseTorrentFile.Instance {
        infoHash: string;
        name?: string | undefined;
        announce?: string[] | undefined;
        urlList?: string[] | undefined;
    }
}

export = ParseTorrent;

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 09:09:39 GMT
 * Dependencies: [@types/magnet-uri](https://npmjs.com/package/@types/magnet-uri), [@types/node](https://npmjs.com/package/@types/node), [@types/parse-torrent-file](https://npmjs.com/package/@types/parse-torrent-file)

# Credits
These definitions were written by [Bazyli Brzóska](https://github.com/niieani), and [Tomasz Łaziuk](https://github.com/tlaziuk).
