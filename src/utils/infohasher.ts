import ParseTorrent, { remote } from './parse-torrent'

export class TorrentParser {
  parsedTorr: ParseTorrent.Instance | undefined = undefined;

  constructor(public uri = '') { }

  async parseTorrent(uri: string = this.uri): Promise<ParseTorrent.Instance | undefined> {
    if (!uri) {
      return
    }
    return await (new Promise((res, rej) => {
      try {
        remote(uri, (err: Error, parsedTorrent) => {
          if (err) { rej(err); console.error(err) }
          if (parsedTorrent) {
            this.uri = uri;
            this.parsedTorr = parsedTorrent;
            console.log('parsedone, infohash:', this.getHash(parsedTorrent))
          }
          res(parsedTorrent)
        })
      } catch (err) {
        rej(err)
      }
    }))
  }

  getHash(torr = this.parsedTorr) {
    return torr?.infoHash
  }
}

export async function getInfoHashFromTorrentUri(torrentUri?: string): Promise<string> {
  const parser = new TorrentParser(torrentUri);
  const parsedTorrentHash = parser.getHash(await parser.parseTorrent());
  if (parsedTorrentHash) {
    return parsedTorrentHash;
  } else {
    throw "no infohash";
  }
}