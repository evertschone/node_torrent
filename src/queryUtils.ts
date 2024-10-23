import { PrismaClient, Prisma, Result } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

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

type QueryWithRelations = Prisma.QueryGetPayload<{
    include: {
        queryGroup: true;
    };
}>;


async function search_again(query: QueryWithRelations): Promise<Result[]> {
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

    if (searchResults.length === 0) {
        throw new Error('No search results found');
    }

    const resultsToCreate: Prisma.ResultCreateInput[] = searchResults.map(result => ({
        guid: result.guid,
        title: result.title,
        link: result.link,
        magnet: result.magnet,
        infoHash: null,
        resultHash: result.infoHash?.toLowerCase() || null,
        info: result.info,
        seeders: result.seeders,
        leechers: result.leechers,
        size: result.size.toString(),
        age: result.age,
        indexer: result.indexer,
        search_date: new Date(), // Set the search_date when creating
        queries: { connect: { id: query.id } },
    }));

    const createdResults: Result[] = [];

    await prisma.$transaction(async (tx) => {
        for (const result of resultsToCreate) {
            // Check if the result already exists
            const existingResult = await tx.result.findUnique({
                where: { guid: result.guid },
                include: { queries: true },
            });

            if (existingResult) {
                // Update existing result with new query connection
                await tx.result.update({
                    where: { guid: result.guid },
                    data: {
                        queries: {
                            connect: { id: query.id },
                        },
                    },
                });
                createdResults.push(existingResult);
            } else {
                // Create new result
                const newResult = await tx.result.create({
                    data: result,
                });
                createdResults.push(newResult);
            }
        }
    });

    // Debugging: Log the createdResults
    console.log('Created Results:', createdResults.map((r=> r.guid)));

    return createdResults;
}

async function select_best_not_already_added(query: QueryWithRelations) {
    const queryResults = await prisma.query.findUnique({
        where: { id: query.id },
        include: {
            results: true
        }
    });

    const results = queryResults?.results?.filter(result => result.state !== 'deleted from client');


    let resultHashes = results?.map(r => r.infoHash).filter((r) => r !== null)

    // Fetch torrents that are already added
    const torrentResults = await prisma.torrent.findMany({
        where: { hash: { in: resultHashes } },
    });

    let torrentHashes = torrentResults.map(r => r.hash);
    const notAddedResults = results?.filter(result => result.infoHash && !torrentHashes.includes(result.infoHash));

    const filteredResults = notAddedResults?.filter(result => {
        const titleIncludeRegex = query.includesRegex || query.queryGroup?.includesRegex;
        const titleExcludeRegex = query.excludesRegex || query.queryGroup?.excludesRegex;
        const targetQuality = query.targetQuality || query.queryGroup?.targetQuality;

        const includeMatch = titleIncludeRegex ? new RegExp(titleIncludeRegex, "i").test(result.title) : true;
        const excludeMatch = titleExcludeRegex ? !new RegExp(titleExcludeRegex, "i").test(result.title) : true;

        return includeMatch && excludeMatch;
    });

    const getScore = (r: Prisma.ResultCreateInput) =>
        (r.seeders >= 1 ? 1 : 0.5) * (r.seeders * 2 + ((r.seeders / (r.leechers + 1)) * (r.leechers + r.seeders)));

    filteredResults?.sort((a, b) => {
        return getScore(b) - getScore(a);
    });

    return filteredResults?.[0] || null;
}

export { search_again, select_best_not_already_added };
