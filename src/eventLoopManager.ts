import { PrismaClient, Query, Result, Torrent, GlobalSettings, Prisma } from '@prisma/client';
import { QBittorrentTorrentState } from './qBittorrent/types/QBittorrentTorrentsMethods';
import qBittorrent, { addTorrentFromResult } from './qbittorrent';
import { search_again, select_best_not_already_added } from './queryUtils';

const prisma = new PrismaClient();

type QueryWithRelations = Prisma.QueryGetPayload<{
    include: {
        queryGroup: true;
    };
}>;

interface Task {
    queryId: number;
    task: () => Promise<void>;
}

const taskQueue: Task[] = [];
let interval: NodeJS.Timeout | null = null;

async function doChecks(query: QueryWithRelations): Promise<void> {
    const log = (message: string) => {
        console.log(`[${new Date().toISOString()}] ${message}`);
    };

    log(`0. Starting doChecks for query ID: ${query.id} with search query: ${query.searchQuery}`);

    try {
        const torrents = await qBittorrent.getTorrentStatuses({ queryId: '' + query.id });

        if (torrents.length > 0) {
            log(`1a. Found ${torrents.length} torrents for query ID: ${query.id}`);

            const dlStates: QBittorrentTorrentState[] = [
                'checkingDL',
                'downloading'
            ];
            const hasActiveTorrent = torrents.some(torrent => dlStates.includes(torrent.state) && Math.abs(torrent.availability) >= 1);
            const waitingStates: QBittorrentTorrentState[] = [
                'allocating',
                'metaDL',
                'queuedDL',
                'checkingResumeData'
            ];
            const hasWaitingTorrent = torrents.every(torrent => waitingStates.includes(torrent.state));

            if (hasActiveTorrent || hasWaitingTorrent) {
                log(`2a. Active torrent found for query ID: ${query.id}. State: ${torrents.find(torrent => dlStates.includes(torrent.state))?.state}, No action needed`);
                goTimeout(query.id);
            } else {
                const completedTorrent = torrents.find(torrent => torrent.progress === 1 && ['queuedUP', 'uploading'].includes(torrent.state));
                if (completedTorrent) {
                    log(`2b. Completed torrent found for query ID: ${query.id}. Torrent hash: ${completedTorrent.hash}, deleting other torrents, and marking query done`);
                    await deleteOtherTorrentsForQuery(query);
                    await markQueryAsDone(query, completedTorrent.save_path);
                } else {
                    let minutesOld = 30;
                    let minSpeedBps = 40;
                    const allTorrentsOld = torrents.every(torrent => new Date(torrent.added_on).getTime() + minutesOld * 60 * 1000 < Date.now());
                    const allTorrentsSlow = torrents.every(torrent => torrent.dlspeed < minSpeedBps * 1000);

                    if (allTorrentsOld) {
                        log(`All torrents are older than ${minutesOld} minutes for query ID: ${query.id}`);
                    } else {
                        log(`Not all torrents are older than ${minutesOld} minutes for query ID: ${query.id}`);
                    }

                    if (allTorrentsSlow) {
                        log(`All torrents are slower than ${minSpeedBps} KBps for query ID: ${query.id}`);
                    } else {
                        log(`Not all torrents are slower than ${minSpeedBps} KBps for query ID: ${query.id}`);
                    }

                    if (allTorrentsOld || allTorrentsSlow) {
                        log(`2c. Performing search and download for query ID: ${query.id}`);
                        await performSearchAndDownload(query);
                        goTimeout(query.id);
                    } else {
                        log(`2d. No action needed for query ID: ${query.id} as torrents are sufficiently new and fast`);
                        goTimeout(query.id);
                    }
                }
            }
        } else {
            log(`1b. No torrents found for query ID: ${query.id}. Initiating search and download.`);
            await performSearchAndDownload(query);
            goTimeout(query.id);
        }
    } catch (error: any) {
        log(`0Error. Error in doChecks for query ID: ${query.id} - ${error.message}`);
        throw error;
    }
}

async function performSearchAndDownload(query: QueryWithRelations): Promise<void> {
    await search_again(query);
    const bestResult = await select_best_not_already_added(query);
    if (bestResult) {
        console.log(bestResult.title, bestResult.infoHash);
        await addTorrentFromResult(bestResult.guid);
    }
}

async function deleteOtherTorrentsForQuery(query: Query): Promise<void> {
    const torrents = await qBittorrent.getTorrentStatuses({ queryId: '' + query.id });
    const completedTorrent = torrents.find(torrent => torrent.progress === 100);
    for (const torrent of torrents) {
        if (torrent.hash !== completedTorrent?.hash &&  // not completed one
            (torrent.size <= (completedTorrent?.size || 1000) && ((torrent.dlspeed > 10 && torrent.progress > 0.1) // and smaller than completed one and still downloading
                || torrent.progress === 1))) {   // or smaller than completed and previously completed
            await qBittorrent.removeTorrent(torrent.hash);
        }
        // ensure bigger torrents that are in progress will continue, and may delete the currently finished one when done. (except that the queries eventloop will stop, so that is a todo..)
    }
}

async function markQueryAsDone(query: Query, destination: string): Promise<void> {
    await prisma.query.update({
        where: { id: query.id },
        data: {
            downloadComplete: true,
            loopRunning: false,
        },
    });
    removeTasks(query.id);
}

function goTimeout(queryId: number): void {
    taskQueue.unshift({
        queryId,
        task: async () => {
            const query = await prisma.query.findUnique({ where: { id: queryId }, include: { queryGroup: true } });
            if (query) {
                await doChecks(query);
            }
        },
    });
}

function removeTasks(queryId: number): void {
    const index = taskQueue.findIndex(task => task.queryId === queryId);
    if (index > -1) {
        taskQueue.splice(index, 1);
    }
}

export async function startEventLoop(): Promise<void> {
    if (!interval) {
        interval = setInterval(async () => {
            const task = taskQueue.pop();
            if (task && task.task) {
                await task.task();
            }
        }, 30000);

        // Persist the state of the global event loop
        await prisma.globalSettings.upsert({
            where: { key: 'globalEventLoopRunning' },
            update: { value: 'true' },
            create: { key: 'globalEventLoopRunning', value: 'true' },
        });
    }
}

export async function stopEventLoop(): Promise<void> {
    if (interval) {
        clearInterval(interval);
        interval = null;

        // Persist the state of the global event loop
        await prisma.globalSettings.upsert({
            where: { key: 'globalEventLoopRunning' },
            update: { value: 'false' },
            create: { key: 'globalEventLoopRunning', value: 'false' },
        });
    }
}

export async function startQueryLoop(queryId: number): Promise<void> {
    const query = await prisma.query.findUnique({ where: { id: queryId } });
    if (query) {
        await prisma.query.update({
            where: { id: queryId },
            data: { loopRunning: true },
        });
        goTimeout(queryId);
    }
}

export async function stopQueryLoop(queryId: number): Promise<void> {
    const query = await prisma.query.findUnique({ where: { id: queryId } });
    if (query) {
        await prisma.query.update({
            where: { id: queryId },
            data: { loopRunning: false },
        });
        removeTasks(queryId);
    }
}

export async function initializeEventLoops(): Promise<void> {
    // Restart the global event loop if it was running
    const globalEventLoopSetting = await prisma.globalSettings.findUnique({ where: { key: 'globalEventLoopRunning' } });
    if (globalEventLoopSetting && globalEventLoopSetting.value === 'true') {
        await startEventLoop();
    }

    // Restart query loops for queries that were running
    const runningQueries = await prisma.query.findMany({ where: { loopRunning: true } });
    for (const query of runningQueries) {
        await startQueryLoop(query.id);
    }
}

// startEventLoop()
