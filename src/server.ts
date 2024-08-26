import express, { Express, Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import sequelize from './sequelize'; // Import sequelize correctly
import { Query, QueryGroup, Result, Torrent } from './models';
import qBittorrent from './qbittorrent';
import { startEventLoop, stopEventLoop, startQueryLoop, stopQueryLoop, initializeEventLoops } from './eventLoopManager';
import { search_again } from './queryUtils';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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
    const queries = await Query.findAll();
    res.json(queries);
  } catch (error) {
    res.status(500).send('Failed to get queries');
  }
});

// Route to get a query by ID
app.get('/api/queries/:id', async (req, res) => {
  try {
    const query = await Query.findByPk(req.params.id);
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
    const newQuery = await Query.create(req.body);
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
    const createdQueries = await Query.bulkCreate(newQueries);
    res.status(201).json(createdQueries);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to add queries');
  }
});


// Route to update a query by ID
app.put('/api/queries/:id', async (req, res) => {
  try {
    const [updated] = await Query.update(req.body, {
      where: { id: req.params.id },
    });

    if (updated) {
      const updatedQuery = await Query.findByPk(req.params.id);
      res.status(200).json(updatedQuery);
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to update query');
  }
});

// Route to delete a query by ID
app.delete('/api/queries/:id', async (req, res) => {
  try {
    const deleted = await Query.destroy({
      where: { id: req.params.id },
    });

    if (deleted) {
      res.status(200).send('Query deleted');
    } else {
      res.status(404).send('Query not found');
    }
  } catch (error) {
    res.status(500).send('Failed to delete query');
  }
});

// Route to get results for a query
app.get('/api/queries/:id/results', async (req: Request, res: Response) => {
  try {
    const queryId = req.params.id;

    // Fetch results associated with the given query ID
    const results = await Result.findAll({
      include: [
        {
          model: Query,
          where: { id: queryId },
          through: { attributes: [] }, // Exclude junction table attributes
          attributes: [] // Exclude Query attributes if not needed
        }
      ]
    });

    res.json(results);
  } catch (error) {
    console.error('Failed to get results:', error);
    res.status(500).send('Failed to get results');
  }
});

app.get('/api/queries/:id/search', async (req: Request, res: Response) => {
  try {
    const query = await Query.findByPk(req.params.id, {
      include: [
        {
          model: QueryGroup,
          attributes: ["name", "id"]
        }
      ]
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


app.post('/api/torrents/add-from-result', async (req, res) => {
  try {
    const { guid } = req.body;
    const torrent = await qBittorrent.addTorrentFromResult(guid);
    res.status(200).json(torrent);
  } catch (error) {
    res.status(500).send('Failed to add torrent from result');
  }
});

app.get('/api/torrents/:hash', async (req, res) => {
  try {
    const hash = req.params.hash;
    const torrent = await qBittorrent.getTorrentInfo(hash);
    res.status(200).json(torrent);
  } catch (error) {
    res.status(500).send('Failed to get torrent info');
  }
});

app.get('/api/torrents/:hash/link', async (req: Request, res: Response) => {
  try {
    const hash = req.params.hash;
    // Fetch the torrent with the associated results and queries
    const torr = await Torrent.findByPk(hash, {
      include: [
        {
          model: Result,
          include: [
            {
              model: Query,
              include: [
                {
                  model: QueryGroup,
                }
              ],
              through: { attributes: [] } // Exclude junction table attributes
            }
          ]
        }
      ]
    });

    if (!torr) {
      return res.status(404).json({ error: 'Torrent not found' });
    }

    // Extract the relevant query and query group name
    let groupName = torr.results?.[0]?.queries?.[0]?.queryGroup?.name;

    if (torr && groupName) {
      await qBittorrent.linkTorFilesToDestination(torr.hash, groupName);
      return res.status(200).json({ status: `Linked to ${groupName}` });
    } else {
      return res.status(400).json({ error: 'Query group name not found' });
    }
  } catch (error) {
    console.error('Failed to get torrent info:', error);
    return res.status(500).send('Failed to get torrent info');
  }
});

app.post('/api/torrents/pause', async (req, res) => {
  try {
    const { hash } = req.body;
    await qBittorrent.stopTorrent(hash);
    res.status(200).send('Torrent paused successfully');
  } catch (error) {
    res.status(500).send('Failed to paused torrent');
  }
});

app.post('/api/torrents/start', async (req, res) => {
  try {
    const { hash } = req.body;
    await qBittorrent.startTorrent(hash);
    res.status(200).send('Torrent resumed successfully');
  } catch (error) {
    res.status(500).send('Failed to resume torrent');
  }
});

app.delete('/api/torrents/:hash', async (req, res) => {
  try {
    const hash = req.params.hash;
    await qBittorrent.removeTorrent(hash);
    res.status(200).send('Torrent removed successfully');
  } catch (error) {
    res.status(500).send('Failed to remove torrent');
  }
});

app.post('/api/torrents/update-statuses', async (req, res) => {
  try {
    const params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string } = req.body;
    const updatedTorrents = await qBittorrent.updateTorrentStatuses(params);
    res.status(200).json(updatedTorrents);
  } catch (error) {
    res.status(500).send('Failed to update torrent statuses');
  }
});

app.post('/api/torrents/get-statuses', async (req, res) => {
  try {
    const params: { hashes?: string[], queryId?: string, category?: string, queryGroupId?: string } = req.body;
    const torrentStatuses = await qBittorrent.getTorrentStatuses(params);
    res.status(200).json(torrentStatuses);
  } catch (error) {
    res.status(500).send('Failed to get torrent statuses');
  }
});

// Route to get all query groups
app.get('/api/querygroups', async (_req, res) => {
  try {
    const queryGroups = await QueryGroup.findAll();
    res.json(queryGroups);
  } catch (error) {
    res.status(500).send('Failed to get query groups');
  }
});

// Route to get a query group by ID
app.get('/api/querygroups/:id', async (req, res) => {
  try {
    const queryGroup = await QueryGroup.findByPk(req.params.id);
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
    const newQueryGroup = await QueryGroup.create(req.body);
    res.status(201).json(newQueryGroup);
  } catch (error) {
    res.status(500).send('Failed to add query group');
  }
});

// Route to update a query group by ID
app.put('/api/querygroups/:id', async (req, res) => {
  try {
    const [updated] = await QueryGroup.update(req.body, {
      where: { id: req.params.id },
    });

    if (updated) {
      const updatedQueryGroup = await QueryGroup.findByPk(req.params.id);
      res.status(200).json(updatedQueryGroup);
    } else {
      res.status(404).send('Query group not found');
    }
  } catch (error) {
    res.status(500).send('Failed to update query group');
  }
});

// Route to delete a query group by ID
app.delete('/api/querygroups/:id', async (req, res) => {
  try {
    const deleted = await QueryGroup.destroy({
      where: { id: req.params.id },
    });

    if (deleted) {
      res.status(200).send('Query group deleted');
    } else {
      res.status(404).send('Query group not found');
    }
  } catch (error) {
    res.status(500).send('Failed to delete query group');
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
    const query = await Query.findByPk(req.params.id);
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
    const query = await Query.findByPk(req.params.id);
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
    const query = await Query.findByPk(req.params.id);
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

// Sync database and start server
sequelize.sync().then(async () => {
  await initializeEventLoops();
  await settingsService.initialize(); // Load the settings
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
