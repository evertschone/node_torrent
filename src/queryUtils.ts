// queryUtils.ts

import { Query, Result, QueryGroup, Torrent, QueryResult } from './models';
import axios from 'axios';
import dotenv from 'dotenv';
import { Op } from 'sequelize';

dotenv.config();

const config = {
    baseUrl: process.env.PROWLARR_BASE_URL as string,
    apiKey: process.env.PROWLARR_API_KEY as string,
    defaultTag: process.env.PROWLARR_DEFAULT_TAG as string, // Add this to your .env file
};

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
        const url = new URL(`${config.baseUrl}/api/v1/search`);
        url.searchParams.append('query', query);
        url.searchParams.append('apikey', config.apiKey);
        indexerIds.forEach(id => url.searchParams.append('indexerIds', id.toString()));

        const response = await axios.get(url.toString());

        if (!response.data || response.data.length === 0) {
            return [];
        }

        return response.data.map((result: any) => ({
            title: result.title,
            link: result.downloadUrl,
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

async function search_again(query: Query): Promise<Result[]> {
    const prowlerTag = (query.prowlerTag || query.queryGroup?.prowlerTag) || config.defaultTag;
  
    let indexerIds: number[] = [];
    if (prowlerTag) {
      indexerIds = await getIndexerIdsByTag(prowlerTag);
    } else if (query.queryGroup?.indexers) {
      indexerIds = query.queryGroup.indexers.split(',').map(Number);
    }
  
    if (indexerIds.length === 0) {
      throw new Error('No indexers found for the specified tag or group');
    }
  
    const searchResults = await searchTorrents(query.searchQuery, indexerIds);
  
    const resultEntries = searchResults.map(result => ({
      ...result,
      infoHash: result.infoHash ? result.infoHash.toLowerCase() : null // Ensure infoHash is lowercase
    }));
  
    const createdResults = await Result.bulkCreate(resultEntries, {
      ignoreDuplicates: true,
      returning: true, // Ensure created results are returned
    });
  
    // Create associations in the QueryResult table
    for (const result of createdResults) {
      await QueryResult.create({ queryId: query.id, guid: result.guid });
    }
  
    return createdResults;
  }

async function select_best_not_already_added(query: Query): Promise<Result> {
    // todo: look for Torrents in client not in torrent DB, or clean up torrent DB first?
    // eg. deleting a torrent from client manually keeps it in the Torrent DB.
    const queryResults = await QueryResult.findAll({
        where: { queryId: query.id },
        include: [{
            model: Result,
            where: { state: { [Op.not]: 'deleted from client' } }
        }],
    });
    // Type assertion to ensure the correct type is used
    const results = queryResults.map(qr => (qr as any).Result as Result);

    let resultHashes = results.map(r => r.infoHash);

    // Fetch torrents that are already added
    const torrentResults = await Torrent.findAll({
        where: { hash: { [Op.in]: resultHashes } },
    });

    let torrentHashes = torrentResults.map(r => r.hash);
    const notAddedResults = results.filter(result => result.infoHash && !torrentHashes.includes(result.infoHash));

    const filteredResults = notAddedResults.filter(result => {
        const titleIncludeRegex = query.includesRegex || query.queryGroup?.includesRegex;
        const titleExcludeRegex = query.excludesRegex || query.queryGroup?.excludesRegex;
        const targetQuality = query.targetQuality || query.queryGroup?.targetQuality;

        const includeMatch = titleIncludeRegex ? new RegExp(titleIncludeRegex, "i").test(result.title) : true;
        const excludeMatch = titleExcludeRegex ? !new RegExp(titleExcludeRegex, "i").test(result.title) : true;
        // const qualityMatch = targetQuality ? result.quality === targetQuality : true;

        return includeMatch && excludeMatch
        //  && qualityMatch;
    });

    const getScore = (r: Result) => { return (r.seeders >= 1 ? 1 : 0.5) * (r.seeders * 2 + ((r.seeders / (r.leechers + 1)) * (r.leechers + r.seeders))) }

    filteredResults.sort((a, b) => {
        return getScore(b) - getScore(a);
    });

    return filteredResults[0] || null;
}

export { search_again, select_best_not_already_added };
