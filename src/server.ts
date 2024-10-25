import express, { Express, Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import qBittorrent, { client, linkTorFilesToDestination, updateTorrentContents } from './qbittorrent';
import { startEventLoop, stopEventLoop, startQueryLoop, stopQueryLoop, initializeEventLoops } from './eventLoopManager';
import { search_again } from './queryUtils';
import fs from 'fs';
import path from 'path';
import { extractKeyframes } from './utils/videoChecker';
// import ffmpeg from 'fluent-ffmpeg';

// Load environment variables from .env file
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Middleware to parse JSON bodies
app.use(express.json());

// Parse CORS origins from environment variables
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [];

// CORS configuration
const corsOptions = {
  origin: corsOrigins,
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Enable CORS
app.use(cors(corsOptions));

// Configuration for Prowlarr using environment variables
const config = {
  baseUrl: process.env.PROWLARR_BASE_URL as string,
  apiKey: process.env.PROWLARR_API_KEY as string,
  tag: process.env.PROWLARR_TAG as string,
};

// Fetch tags from Prowlarr and find the specified tag's indexerIds
async function getIndexerIdsByTag(tag: string): Promise<number[]> {
  try {
    const response = await axios.get(`${config.baseUrl}/api/v1/tag/detail`, {
      params: {
        apikey: config.apiKey,
      },
    });

    const tags = response.data;
    const tagDetails = tags.find((t: any) => t.label.toLowerCase() === tag.toLowerCase());

    if (tagDetails) {
      return tagDetails.indexerIds;
    } else {
      console.error(`Tag "${tag}" not found.`);
      return [];
    }
  } catch (error) {
    console.error('Error fetching tags:', (error as Error).message);
    return [];
  }
}

async function searchTorrents(query: string, indexerIds: number[]): Promise<any[]> {
  try {
    // Build the URL with multiple indexerIds
    const url = new URL(`${config.baseUrl}/api/v1/search`);
    url.searchParams.append('query', query);
    url.searchParams.append('apikey', config.apiKey);
    indexerIds.forEach(id => url.searchParams.append('indexerIds', id.toString()));

    const response = await axios.get(url.toString());

    console.log('Response data:', response.data); // Log the response for debugging

    if (!response.data || response.data.length === 0) {
      console.error('No results found:', response.data);
      return [];
    }

    return response.data.map((result: any) => ({
      title: result.title,
      link: result.downloadUrl, // Updated field
      magnet: result.magnetUrl,
      infoHash: result.infoHash?.toLowerCase() || null,
      info: result.infoUrl,
      seeders: result.seeders,
      leechers: result.leechers,
      size: result.size,
      age: result.age,
      indexer: result.indexer,
      guid: result.guid,
    }));
  } catch (error) {
    console.error('Error searching torrents:', (error as Error).message);
    return [];
  }
}

// Route to get all queries
app.get('/api/queries', async (_req, res) => {
  try {
    const queries = await prisma.query.findMany();
    res.json(queries);
  } catch (error) {
    res.status(500).send('Failed to get queries');
  }
});

// Route to get a query by ID
app.get('/api/queries/:id', async (req, res) => {
  try {
    const query = await prisma.query.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (query) {
      res.json(query);
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to get query');
  }
});

// Route to add a new query
app.post('/api/queries', async (req, res) => {
  try {
    let body = {
      id: req.body.id,
      searchQuery: req.body.searchQuery,
      prowlerTag: req.body.prowlerTag,
      targetQuality: req.body.targetQuality,
      searchFrequency: req.body.searchFrequency,
      includesRegex: req.body.includesRegex,
      excludesRegex: req.body.excludesRegex,
      loopRunning: req.body.loopRunning || false,
      downloadComplete: req.body.downloadComplete || false,
      queryGroupId: req.body.queryGroupId || null
    }
    const newQuery = await prisma.query.create({
      data: body,
    });
    res.status(201).json(newQuery);
  } catch (error) {
    res.status(500).send('Failed to add query');
  }
});

app.post('/api/queries/bulk', async (req, res) => {
  try {
    const { queryList, ...commonParams } = req.body;

    if (!queryList || typeof queryList !== 'string') {
      return res.status(400).send('Invalid queryList parameter');
    }

    // Split the queryList parameter by newlines
    const myQueryList = queryList.split('\n').map(query => query.trim()).filter(query => query !== '');

    // Prepare the list of queries to be bulk inserted
    const newQueries = myQueryList.map(searchQuery => ({
      ...commonParams,
      searchQuery,
    }));

    // Bulk create queries
    const createdQueries = await prisma.query.createMany({
      data: newQueries,
    });
    res.status(201).json(createdQueries);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to add queries');
  }
});

// Route to update a query by ID
app.put('/api/queries/:id', async (req, res) => {
  try {
    const updatedQuery = await prisma.query.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });

    res.status(200).json(updatedQuery);
  } catch (error) {
    res.status(500).send('Failed to update query');
  }
});

// Route to delete a query by ID
app.delete('/api/queries/:id', async (req, res) => {
  try {
    const deletedQuery = await prisma.query.delete({
      where: { id: Number(req.params.id) },
    });

    res.status(200).send('Query deleted');
  } catch (error) {
    res.status(500).send('Failed to delete query');
  }
});

// Route to get results for a query
app.get('/api/queries/:id/results', async (req: Request, res: Response) => {
  try {
    const queryId = Number(req.params.id);

    // Fetch results associated with the given query ID
    const results = await prisma.result.findMany({
      include: { queries: true },
      where: {
        queries: {
          some: {
            id: queryId
          }
        }
      }
    });

    res.json(results);
  } catch (error) {
    console.error('Failed to get results:', error);
    res.status(500).send('Failed to get results');
  }
});

// Route to search for a query
app.get('/api/queries/:id/search', async (req: Request, res: Response) => {
  try {
    const query = await prisma.query.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        queryGroup: true,
      }
    });

    if (!query) {
      return res.status(404).send('Query not found');
    }

    const searchResults = await search_again(query);
    res.status(200).json(searchResults);
  } catch (error) {
    console.error('Failed to search for query:', error);
    res.status(500).send('Failed to search for query');
  }
});

// Route to add a torrent from a result
app.post('/api/torrents/add-from-result', async (req, res) => {
  try {
    const { guid } = req.body;
    const torrent = await qBittorrent.addTorrentFromResult(guid);
    res.status(200).json(torrent);
  } catch (error) {
    res.status(500).send('Failed to add torrent from result');
  }
});

// Route to get torrent info by hash
app.get('/api/torrents/:hash', async (req, res) => {
  try {
    const hash = req.params.hash;
    const torrent = await qBittorrent.getTorrentInfo(hash);
    res.status(200).json(torrent);
  } catch (error) {
    res.status(500).send('Failed to get torrent info');
  }
});

// Route to link torrent files to destination
app.get('/api/torrents/:hash/link', async (req: Request, res: Response) => {
  try {
    const hash = req.params.hash;
    // Fetch the torrent with the associated results and queries
    const torrent = await prisma.torrent.findUnique({
      where: { hash: hash },
      include: {
        results: {
          include: {
            queries: {
              include: {
                queryGroup: true,
              }
            }
          }
        }
      }
    });

    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found' });
    }

    // Extract the relevant query and query group name
    let groupName = torrent.results?.[0]?.queries?.[0]?.queryGroup?.name;

    if (torrent && groupName) {
      await qBittorrent.linkTorFilesToDestination(torrent.hash, groupName);
      return res.status(200).json({ status: `Linked to ${groupName}` });
    } else {
      return res.status(400).json({ error: 'Query group name not found' });
    }
  } catch (error) {
    console.error('Failed to get torrent info:', error);
    return res.status(500).send('Failed to get torrent info');
  }
});

// Endpoint to get torrent contents
app.get('/api/torrents/:hash/contents', async (req, res) => {
  try {
    const { hash } = req.params;
    const contents = await prisma.torrentContent.findMany({
      where: { torrentId: hash },
    });
    const serializedContents = contents.map((content: {
      id: string;
      name: string;
      size: string;
      progress: number;
      priority: number;
      is_seed: boolean;
      piece_range: string;
      piece_size: string;
      availability: number;
      hardlinkPath: string;
      torrentId: string | null;
    }) => ({
      ...content,
      size: content.size.toString(),
    }));
    res.status(200).json(serializedContents);
  } catch (error) {
    console.error('Error fetching torrent contents:', error);
    res.status(500).send('Failed to fetch torrent contents');
  }
});


// Route to pause a torrent
app.post('/api/torrents/pause', async (req, res) => {
  try {
    const { hash } = req.body;
    await qBittorrent.stopTorrent(hash);
    res.status(200).send('Torrent paused successfully');
  } catch (error) {
    res.status(500).send('Failed to paused torrent');
  }
});

// Route to start a torrent
app.post('/api/torrents/start', async (req, res) => {
  try {
    const { hash } = req.body;
    await qBittorrent.startTorrent(hash);
    res.status(200).send('Torrent resumed successfully');
  } catch (error) {
    res.status(500).send('Failed to resume torrent');
  }
});

// Route to delete a torrent
app.delete('/api/torrents/:hash', async (req, res) => {
  try {
    const hash = req.params.hash;
    await qBittorrent.removeTorrent(hash);
    res.status(200).send('Torrent removed successfully');
  } catch (error) {
    res.status(500).send('Failed to remove torrent');
  }
});

// Endpoint to update torrent contents and check for hardlinks
app.post('/api/torrents/update-contents', async (req, res) => {
  try {
    const { hash } = req.body; // Include destinationDir in the request body
    await updateTorrentContents(hash);
    //await linkTorFilesToDestination(hash, 'preview');
    res.status(200).send('Torrent contents updated successfully and hardlinks checked');
  } catch (error) {
    console.error('Error updating torrent contents and checking for hardlinks:', error);
    res.status(500).send('Failed to update torrent contents and check for hardlinks');
  }
});
// Route to update torrent statuses
app.post('/api/torrents/update-statuses', async (req, res) => {
  try {
    const params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string } = req.body;
    const updatedTorrents = await qBittorrent.updateTorrentStatuses(params);
    res.status(200).json(updatedTorrents);
  } catch (error) {
    res.status(500).send('Failed to update torrent statuses');
  }
});

// Route to get torrent statuses
app.post('/api/torrents/get-statuses', async (req, res) => {
  try {
    const params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string } = req.body;
    const torrentStatuses = await qBittorrent.getTorrentStatuses(params);
    res.status(200).json(torrentStatuses);
  } catch (error) {
    res.status(500).send('Failed to get torrent statuses');
  }
});




// Helper function to find the next available range
const findNextAvailableRange = (pieceStates: any, pieceRange: string, start: number, end: number, fileSize: number, torrPieceSize: number) => {
  const pieces = pieceStates;
  const [pieceStart, pieceEnd] = JSON.parse(pieceRange);
  const filePieceStates = pieces.slice(pieceStart, pieceEnd + 1);
  const pieceSize = torrPieceSize //Math.floor(fileSize / (pieceEnd - pieceStart))
  if (pieceSize !== torrPieceSize) {
    console.log("torrPS: " + torrPieceSize + " =! PS:" + pieceSize + " diff: " + (torrPieceSize - pieceSize))
  }

  let newStart = start;
  let newEnd = end;

  // Find the first available piece
  for (let i = Math.floor(start / pieceSize); i <= Math.floor(end / pieceSize); i++) {
    if (filePieceStates[i] === 2) {
      newStart = Math.max(start, i * pieceSize);
      break;
    }
  }

  // Find the last contiguous available piece
  for (let i = Math.floor(newStart / pieceSize); i <= Math.floor(end / pieceSize); i++) {
    if (filePieceStates[i] !== 2) {
      newEnd = Math.min(end, (i * pieceSize) - 1);
      break;
    }
  }
  if (start !== newStart) {
    console.log("changed start from " + start + " to byte:" + newStart)
  }
  return { newStart, newEnd };
};


function shiftOffsets(data: {
  offset: number;
  available: boolean;
  downloading: boolean;
  pieceNum: number
}[]): {
  offset: number;
  available: boolean;
  downloading: boolean;
  pieceNum: number
}[] {
  // Create a new array to avoid mutating the original data
  const result = data.map(item => ({ ...item }));

  // Shift offsets one index over
  for (let i = result.length - 1; i > 0; i--) {
    result[i].offset = result[i - 1].offset;
  }

  // Set the offset of the first object to 0
  if (result.length > 0) {
    result[0].offset = 0;
  }

  return result;
}

// Endpoint to stream video file
app.get('/api/availability/:torrentId', async (req, res) => {

  try {
    const { torrentId } = req.params;

    type PartStates = { offset: number, available: boolean, downloading: boolean }

    if (torrentId) {
      const pieceStates: any = await client.getPieceStates(torrentId);
      //loop over relatedContents here. for each content
      const relatedContents = await prisma.torrentContent.findMany({
        where: { torrentId: torrentId },
      });
      if (relatedContents?.length > 0) {
        let result: { vId: string, fileName: string, partStates: PartStates[], fileSize: number, pieceSize: number }[] = [];

        let offset = parseInt(relatedContents[0].piece_size);
        relatedContents.forEach((relatedContent: {
          id: string;
          name: string;
          size: string;
          progress: number;
          priority: number;
          is_seed: boolean;
          piece_range: string;
          piece_size: string;
          availability: number;
          hardlinkPath: string;
          torrentId: string | null;
        }) => {
          const pieceSize = parseInt(relatedContent.piece_size);
          const [start, end] = JSON.parse(relatedContent.piece_range);
          // console.dir("size " + parseInt(relatedContent.size + ""))
          const relatedFilePieceStates: number[] = pieceStates.slice(start, end + 1);
          let nextOffset = ((relatedFilePieceStates.length * pieceSize) - parseInt(relatedContent.size));

          const partStates = relatedFilePieceStates.map((state: number, i: number, arr: number[]) => {
            return ({
              offset: i == 0 ? offset : (i == relatedFilePieceStates.length - 1) ? pieceSize - nextOffset : (i + 1) * pieceSize,
              available: state == 2,
              downloading: state == 1,
              // pieceNum: start + i
            })
          });

          result.push({ vId: relatedContent.id, fileName: relatedContent.name, fileSize: parseInt(relatedContent.size), pieceSize: pieceSize, partStates: partStates })

          offset = nextOffset;
          // console.dir("nextOffset " + offset)

          // console.log(offset + pieceSize)
          // console.log([start, partStates.slice(0, 3)])
          // console.log([end, partStates.slice(partStates.length - 1)])
        });
        // res.json({ partStates: allPartStates, fileSize, pieceSize });
        res.json(result);
      }
    }
  } catch (err) {
    console.error(err)
  }
});

app.get('/api/keyframes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const content = await prisma.torrentContent.findUnique({
      where: { id },
      include: { torrent: true }
    });

    if (!content) {
      return res.status(404).send('Content not found');
    }
    let filePath = path.join(settingsService.getSetting('torrentClientBasePath') || '', content.torrent?.save_path || '', fixIllegalName(content.name));

    let keyFrames = await extractKeyframes(filePath);

    res.json(keyFrames);
  } catch (error) {
    res.status(500).send('Failed to get keyFrames');
  }
})

const fixIllegalName = (name: string) => name.replace(/[<>:"\|?*]/g, "")

// Endpoint to stream video file
app.get('/api/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const content = await prisma.torrentContent.findUnique({
      where: { id },
      include: { torrent: true }
    });

    if (!content) {
      return res.status(404).send('Content not found');
    }

    let filePath = path.join(settingsService.getSetting('torrentClientBasePath') || '', content.torrent?.save_path || '', fixIllegalName(content.name));

    const pieceSize = parseInt(content.piece_size);

    if (content.torrentId) {
      // const pieceStates = await client.getPieceStates(content.torrentId);
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        //const { newStart, newEnd } = findNextAvailableRange(pieceStates, content.piece_range, start, end, fileSize, pieceSize);
        let newEnd = end
        let newStart = start;

        if (start >= fileSize || start >= newEnd) {
          res.status(416).json({ err: 'Requested range not satisfiable:' + start, next_piece: newStart, chunkSize: pieceSize, fileSize: fileSize });
          return;
        }

        const chunkSize = (newEnd - newStart) + 1;
        const file = fs.createReadStream(filePath, { start: newStart, end: newEnd });
        const head = {
          'Content-Range': `bytes ${newStart}-${newEnd}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
    }
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).send('Failed to stream video');
  }
});

// Route to get all query groups
app.get('/api/querygroups', async (_req, res) => {
  try {
    const queryGroups = await prisma.queryGroup.findMany();
    res.json(queryGroups);
  } catch (error) {
    res.status(500).send('Failed to get query groups');
  }
});

// Route to get a query group by ID
app.get('/api/querygroups/:id', async (req, res) => {
  try {
    const queryGroup = await prisma.queryGroup.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (queryGroup) {
      res.json(queryGroup);
    } else {
      res.status(404).send('Query group not found');
    }
  } catch (error) {
    res.status(500).send('Failed to get query group');
  }
});

// Route to add a new query group
app.post('/api/querygroups', async (req, res) => {
  try {
    const newQueryGroup = await prisma.queryGroup.create({
      data: req.body,
    });
    res.status(201).json(newQueryGroup);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Route to update a query group by ID
app.put('/api/querygroups/:id', async (req, res) => {
  try {
    const updatedQueryGroup = await prisma.queryGroup.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });

    res.status(200).json(updatedQueryGroup);
  } catch (error) {
    res.status(500).send('Failed to update query group' + error);
  }
});

// Route to delete a query group by ID
app.delete('/api/querygroups/:id', async (req, res) => {
  try {
    const deletedQueryGroup = await prisma.queryGroup.delete({
      where: { id: Number(req.params.id) },
    });

    res.status(200).send('Query group deleted');
  } catch (error) {
    res.status(500).send('Failed to delete query group' + error);
  }
});

// Route to start the event loop
app.post('/api/event-loop/start', (_req, res) => {
  try {
    startEventLoop();
    res.status(200).send('Event loop started');
  } catch (error) {
    res.status(500).send('Failed to start event loop');
  }
});

// Route to stop the event loop
app.post('/api/event-loop/stop', (_req, res) => {
  try {
    stopEventLoop();
    res.status(200).send('Event loop stopped');
  } catch (error) {
    res.status(500).send('Failed to stop event loop');
  }
});

// Route to start a query loop
app.post('/api/queries/:id/start-loop', async (req, res) => {
  try {
    const query = await prisma.query.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (query) {
      startQueryLoop(query.id);
      res.status(200).send('Query loop started');
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to start query loop');
  }
});

// Route to stop a query loop
app.post('/api/queries/:id/stop-loop', async (req, res) => {
  try {
    const query = await prisma.query.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (query) {
      stopQueryLoop(query.id);
      res.status(200).send('Query loop stopped');
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to stop query loop');
  }
});

// Route to check if a query loop is running
app.get('/api/queries/:id/loop-status', async (req, res) => {
  try {
    const query = await prisma.query.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (query) {
      res.json({ loopRunning: query.loopRunning });
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to get loop status');
  }
});

// SETTINGS
import settingsService, { AllowedKey, allowedKeys } from './utils/SettingsService';

// Endpoint to get all global settings
app.get('/api/global-settings', async (_req, res) => {
  try {
    const settings = settingsService.getAllSettings();
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error fetching global settings:', error);
    res.status(500).send('Failed to fetch global settings');
  }
});

// Endpoint to get a specific global setting
app.get('/api/global-settings/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  if (!allowedKeys.includes(<AllowedKey>key)) {
    return res.status(400).send('Invalid key');
  } else {
    try {
      const setting = settingsService.getSetting(<AllowedKey>key);
      if (setting !== undefined) {
        res.status(200).json({ key, value: setting });
      } else {
        res.status(404).send('Setting not found');
      }
    } catch (error) {
      console.error('Error fetching global setting:', error);
      res.status(500).send('Failed to fetch global setting');
    }
  }
});

// Endpoint to set a global setting
app.post('/api/global-settings', async (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!allowedKeys.includes(key)) {
    return res.status(400).send('Invalid key');
  }
  try {
    await settingsService.setSetting(key, value);
    res.status(201).json({ key, value });
  } catch (error) {
    console.error('Error setting global setting:', error);
    res.status(500).send('Failed to set global setting');
  }
});

//
//VIDEO STreAMINg AND TrANSCODINg START
//



// Initialize and start server
(async () => {
  // await prisma.$connect();
  // await initializeEventLoops();
  // await settingsService.initialize(); // Load the settings
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    setInterval(() => { console.log("TESTING"); }, 4000)
    console.log(process.env)
  });
})();
