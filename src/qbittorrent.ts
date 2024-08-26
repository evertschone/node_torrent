import { Torrent, Result, Query, QueryGroup, QueryResult } from './models';
import dotenv from 'dotenv';
import ClientRequestManager from './qBittorrent/clientRequestManager';
import type { QBittorrentConnectionSettings } from './qBittorrent/clientConnectionSettings';
// import { InferCreationAttributes } from 'sequelize';
// import { Torrent as TorrentClass } from './classes/Torrent';
import { ITorrent } from './types/Torrent';
import request from 'request';
// import fetch from 'node-fetch';

import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Define the connection settings
const qBittorrentConfig: QBittorrentConnectionSettings = {
  client: "qBittorrent",
  type: "web",
  version: 1,
  url: process.env.QBITTORRENT_BASE_URL as string,
  username: process.env.QBITTORRENT_USERNAME as string,
  password: process.env.QBITTORRENT_PASSWORD as string
};

// Create an instance of ClientRequestManager
const client = new ClientRequestManager(qBittorrentConfig);

import { TorrentParser } from './utils/infohasher'
import axios, { AxiosError } from 'axios';
import sequelize, { InferCreationAttributes, Op } from 'sequelize';
import { TorrentContent } from './models/TorrentContent';
import settingsService from './utils/SettingsService';
const torrentParserInstance = new TorrentParser();

const getInfoHashFromTorrentUri = async (uri: string) => {
  try {
    return torrentParserInstance.getHash(await torrentParserInstance.parseTorrent(uri))
  } catch {
    console.log("couldnt parse torrent: " + uri)
  }
}

async function findRedirectUrl(startUrl: string): Promise<string> {
  let finalUrl = startUrl;

  try {
    finalUrl = await new Promise<string>((resolve, rej) => {
      request({ url: startUrl, followRedirect: false },
        (err, res, body) => {
          console.log(res.headers.location);
          if (res.headers.location) {
            resolve(res.headers.location);
          } else {
            resolve(startUrl);
          }
        })
    })
  } catch (error: any) {
    console.error('Error:', error.message);
    finalUrl = startUrl; // In case of an error, return the original URL
  }
  return finalUrl;
}

export async function addTorrentFromResult(guid: string): Promise<any> {
  try {
    // Find the result by guid
    const result = await Result.findOne({
      where: { guid },
      include: [
        {
          model: Query,
          attributes: ["searchQuery", "id"],
          include: [
            {
              model: QueryGroup,
              attributes: ["name", "id"]
            }
          ],
          through: { attributes: [] } // Exclude junction table attributes
        }
      ]
    });
    if (!result) {
      throw new Error('Result not found');
    }

    // Check for magnet link, else use .torrent link
    let prowlink = result.magnet ? result.magnet : result.link;
    let link = await findRedirectUrl(prowlink); // Follow redirects, e.g., to magnet links.

    // Extract info hash from the magnet link
    let infoHash: null | string = result.infoHash && result.infoHash?.toLowerCase()
    let infoHashTr = infoHash;
    infoHash = await getInfoHashFromTorrentUri(link) || null;
    if (!infoHash && result.magnet) {
      infoHash = await getInfoHashFromTorrentUri(result.magnet) || null;
    }
    if (infoHashTr && infoHashTr !== infoHash) {
      throw new Error("infohash on tracker mismatch");
    }

    if (!infoHash) {
      throw new Error('No infohash found, tracker may be down or link points to an invalid torrent.');
    } else {
      // Add the torrent using the link
      const torrent = await addTorrent(link, infoHash); // Change category if needed

      if (!torrent) {
        return;
      }

      const torrentObj: ITorrent = {
        ...torrent,
        resultGuid: result.guid
      };
      const torrentRow = await Torrent.upsert(torrentObj);

      // Update the Result to set downloading to true, and add infohash in case it was retrieved.
      await result.update({ infoHash, downloading: false, state: 'added' });

      // Create the association between the result and the torrent
      await result.$set('torrent', torrentRow[0]);

      await startTorrent(infoHash);

      return torrent;
    }
  } catch (error) {
    console.error('Error adding torrent from result:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

async function updateTorrentContents(hash: string): Promise<void> {
  try {
    const contents = await client.getTorrentContents(hash);
    const pieceStates = await client.getPieceStates(hash);
    let idx = 0;
    for (const content of contents) {
      await TorrentContent.upsert({
        id: hash + "_" + idx,
        name: content.name,
        size: content.size,
        progress: content.progress,
        priority: content.priority,
        is_seed: content.is_seed,
        piece_range: JSON.stringify(content.piece_range),
        availability: content.availability,
        hardlinkPath: '', // or populate if available
        torrentId: hash // Assuming torrentId is the hash
      });
      idx++
    };

    await Torrent.update({
      piece_states: JSON.stringify(pieceStates)
    }, { where: { hash } })
  } catch (error) {
    console.error('Error fetching or updating torrent contents:', error);
  }
}

async function pollForTorrentDownloadStart(callback: (hash: string, resultGuid: string) => void, interval = 5000): Promise<void> {
  const checkDownloadStarted = async (): Promise<void> => {
    try {
      const addedResults = await Result.findAll({
        where: { state: 'added', downloading: false },
        include: { model: Torrent }
      });

      if (addedResults.length === 0) {
        return;
      }

      const hashes = addedResults.map(result => result.infoHash);
      const torrentInfos = await client.getTorrentInfos({ hashes: hashes.join('|') });

      for (const info of torrentInfos) {
        const result = addedResults.find(r => r?.torrent?.hash === info.hash);

        if (!result) {
          continue;
        }

        if (['downloading', 'checking', 'seeding'].includes(info.state)) {
          await Torrent.update(
            { ...info },
            { where: { hash: info.hash } }
          );
          await Result.update(
            { state: 'added', downloading: true },
            { where: { infoHash: info.hash } }
          );

          // Call the callback to handle the torrent that started downloading
          callback(info.hash, result.guid);

          // Update torrent contents
          await updateTorrentContents(info.hash);
        }
      }

      if (torrentInfos.length !== hashes.length) {
        const tiHashes = torrentInfos.map((ti) => ti.hash);
        const missingHashes = hashes.filter((h) => h && !tiHashes.includes(h));
        for (const hash of missingHashes) {
          await Result.update(
            { state: 'deleted from client', downloading: false },
            { where: { infoHash: hash } }
          );
        }
      }
    } catch (error) {
      console.error('Error checking torrent statuses:', error);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  while (true) {
    await checkDownloadStarted();
    await sleep(interval);
  }
}

async function addTorrent(magnetUrl: string, infoHash: string, category?: string): Promise<ITorrent | null> {
  try {
    await client.updateAuthCookie(qBittorrentConfig); // Ensure authentication

    const downloadBaseDir = settingsService.getSetting('torrentClientSavePath') || "/data/torrents/rainTorrent";
    console.log(`Download base directory is: ${downloadBaseDir}`);

    category = category || settingsService.getSetting('defaultTorrentCategory');
    console.log(`Download category is: ${category}`);

    // Add the torrent
    await client.torrentsAddURLs([magnetUrl], { category: category, sequentialDownload: true, firstLastPiecePrio: true, savepath: downloadBaseDir });

    // Extract info hash from the magnet link
    //const infoHash = getInfoHashFromMagnet(magnetUrl);

    // Poll for the torrent until it appears in the client
    const torrent = await pollForTorrentExistInClient(infoHash);
    return torrent || null;
  } catch (error) {
    console.error('Error adding torrent:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

async function pollForTorrentExistInClient(infoHash: string): Promise<ITorrent | undefined> {
  const pollInterval = 2000; // 1 second
  const maxRetries = 30; // 30 seconds

  for (let i = 0; i < maxRetries; i++) {
    const torrents = await client.getTorrentInfos({ hashes: infoHash });
    const torrent = torrents.find(t => t.hash === infoHash);
    if (torrent) {
      return torrent;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  console.error('Torrent did not appear in the client within the expected time');
}

async function getTorrentInfo(hashes: string): Promise<ITorrent[] | null> {
  try {
    await client.updateAuthCookie(); // Ensure authentication
    const torrent = await client.getTorrentInfos({ hashes: hashes });
    return torrent;
  } catch (error) {
    console.error('Error getting torrent info:', (error as Error).message);
    return null;
  }
}

async function stopTorrent(hash: string): Promise<void> {
  try {
    await client.updateAuthCookie(); // Ensure authentication
    await client.torrentsPause([hash]);
    console.log('Torrent stopped successfully');

    // Update torrent in database
    await Torrent.update({ state: 'pausedDL' }, { where: { hash } });

    const results = await Result.findAll({ where: { infoHash: hash } });
    if (!results?.length) {
      console.error('Result not found');
    } else {
      results.forEach(async (result) => {
        await result.update({ downloading: false });
      })
    }

  } catch (error) {
    console.error('Error stopping torrent:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

async function startTorrent(hash: string): Promise<void> {
  try {
    await client.updateAuthCookie(); // Ensure authentication
    await client.torrentsResume([hash]);
    console.log('Torrent resumed successfully');

    // Update torrent in database
    // await Torrent.update({ state: 'downloading' }, { where: { hash } });
  } catch (error) {
    console.error('Error stopping torrent:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

async function removeTorrent(hash: string): Promise<void> {
  try {
    await client.updateAuthCookie(); // Ensure authentication
    await client.torrentsDelete([hash], true);
    console.log('Torrent removed successfully from client');

    // Remove torrent from database
    const torrent = await Torrent.findOne({ where: { hash } });
    if (torrent) {
      // const result = torrent.result; // Get the associated result
      // await result.update({ downloading: false }); // Update downloading to false
      await torrent.destroy(); // Remove torrent from database
      console.log('Torrent removed successfully from database');

      const results = await Result.findAll({ where: { infoHash: hash } });
      if (!results?.length) {
        console.error('Search Result for torrent not found');
      } else {
        results.forEach(async (result) => {
          await result.update({ downloading: false });
        });
      }
    }
  } catch (error) {
    console.error('Error removing torrent:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}


async function updateTorrentStatuses(params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string }): Promise<ITorrent[]> {
  try {
    await client.updateAuthCookie(); // Ensure authentication

    let torrents;

    if (params.hashes) {
      torrents = await Torrent.findAll({
        where: { hash: params.hashes },
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.queryId) {
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            where: { id: params.queryId },
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.category) {
      torrents = await Torrent.findAll({
        where: { category: params.category },
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.queryGroupId) {
      const queries = await Query.findAll({
        where: { queryGroupId: params.queryGroupId }
      });
      const queryIds = queries.map(query => query.id);
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            where: { id: { [Op.in]: queryIds } },
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else {
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    }

    if (torrents.length === 0) {
      console.log("No torrents found");
      return [];
    } else {
      // Update Torrents in db.
      const hashes = torrents.map(torrent => torrent.hash);
      const updatedTorrents = await client.getTorrentInfos({ hashes: hashes.join("|") });

      // Update torrent statuses in the database
      for (const updated of updatedTorrents) {
        await Torrent.update(
          {
            ...updated,
            //hash: torrents ? torrents.find((t) => t?.hash === updated?.hash)?.hash : '',
          },
          { where: { hash: updated.hash } }
        );
      }

      // Update Torrent Contents in Database
      for (const torr of updatedTorrents) {
        await updateTorrentContents(torr.hash);
      }

      return updatedTorrents.map((updated) => ({
        ...updated,
        // resultGuid: torrents ? torrents.find((t) => t?.hash === updated?.hash)? : '',
      }));
    }
  } catch (error) {
    console.error('Error updating torrent statuses:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

async function getTorrentStatuses(params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string }): Promise<ITorrent[]> {
  try {
    await client.updateAuthCookie(); // Ensure authentication

    let torrents;

    if (params.hashes) {
      torrents = await Torrent.findAll({
        where: { hash: params.hashes },
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.queryId) {
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            where: { id: params.queryId },
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.category) {
      torrents = await Torrent.findAll({
        where: { category: params.category },
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else if (params.queryGroupId) {
      const queries = await Query.findAll({
        where: { queryGroupId: params.queryGroupId }
      });
      const queryIds = queries.map(query => query.id);
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            where: { id: { [Op.in]: queryIds } },
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    } else {
      torrents = await Torrent.findAll({
        include: {
          model: Result,
          include: [{
            model: Query,
            through: { attributes: [] } // Exclude junction table attributes
          }]
        }
      });
    }

    if (torrents.length === 0) {
      console.log("No torrents found");
      return [];
    } else {
      const hashes = torrents.map(torrent => torrent.hash);
      const torrentInfos = await client.getTorrentInfos({ hashes: hashes.join("|") });

      // Convert torrentInfos to the Torrent model format
      const torrentsInDatabaseFormat = torrentInfos.map(info => {
        const torrent = torrents.find((t) => t?.hash === info?.hash);
        let torrentObj: ITorrent = {
          ...info,
          queryIds: torrent?.results?.flatMap((r) => r?.queries?.flatMap((q) => q?.id)), // Ensure queryId is included
          queryGroupIds: torrent?.results?.flatMap((r) => r?.queries?.flatMap((q) => q?.queryGroupId)) // Ensure queryGroupId is included
        };
        return torrentObj;
      });

      return torrentsInDatabaseFormat;
    }
  } catch (error) {
    console.error('Error getting torrent statuses:', (error as Error).message);
    throw error; // Ensure the error is propagated
  }
}

const createHardlink = (src: string, dst: string) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.linkSync(src, dst);
}

const createSoftlink = (src: string, dst: string) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.symlinkSync(src, dst);
}

const basePath = settingsService.getSetting("torrentClientBasePath") || "P:/anaNAS"
const linkPath = settingsService.getSetting("destinationSavePath") || "P:/anaNAS/data/torrents/rain_collector";

const linkTorFilesToDestination = async (torrentHash: string, destinationDir: string) => {
  const torrentContent = await client.getTorrentContents(torrentHash);
  const torrentInfo = await client.getTorrentInfos({ hashes: torrentHash });
  // Create Hardlink or Softlink for Video Files
  for (const file of torrentContent) {
    if (file.size > 10000 && torrentInfo[0].progress > 0) {  // most video files
      let savePath = torrentInfo[0].save_path
      const srcPath = path.join(basePath, savePath, file.name);
      if (file?.name) {
        let basename = file.name.split(/[\\/]/).join("_")
        const hardlinkDst = path.join(linkPath, destinationDir, basename);
        createHardlink(srcPath, hardlinkDst);
      }
    }
  }
}

async function restoreQueue() {
  await pollForTorrentDownloadStart(async (hash: string, resultGuid: string) => {
    const result = await Result.findOne({
      where: { guid: resultGuid },
      include: [
        {
          model: Query,
          attributes: ["searchQuery", "id"],
          include: [
            {
              model: QueryGroup,
              attributes: ["name", "id"]
            }
          ],
          through: { attributes: [] } // Exclude junction table attributes
        }
      ]
    });

    let groupName = result?.queries?.[0]?.queryGroup?.name;

    if (hash && groupName) {
      await linkTorFilesToDestination(hash, groupName);
      console.log(`Torrent with hash ${hash} has started downloading. Files hardlinked to ${groupName}.`);
    } else {
      console.log(`Failed to find group name for torrent with hash ${hash}.`);
    }
  });
}


// Call this function on app startup
restoreQueue().catch(error => console.error('Error restoring queue:', error.message));

export default {
  addTorrentFromResult,
  getTorrentInfo,
  stopTorrent,
  startTorrent,
  removeTorrent,
  updateTorrentStatuses,
  getTorrentStatuses,
  linkTorFilesToDestination
};
