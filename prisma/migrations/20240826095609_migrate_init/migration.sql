-- CreateTable
CREATE TABLE "GlobalSettings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Query" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "searchQuery" TEXT NOT NULL,
    "prowlerTag" TEXT NOT NULL,
    "targetQuality" TEXT NOT NULL,
    "searchFrequency" INTEGER NOT NULL,
    "includesRegex" TEXT NOT NULL,
    "excludesRegex" TEXT NOT NULL,
    "loopRunning" BOOLEAN NOT NULL DEFAULT false,
    "downloadComplete" BOOLEAN NOT NULL DEFAULT false,
    "queryGroupId" INTEGER,
    CONSTRAINT "Query_queryGroupId_fkey" FOREIGN KEY ("queryGroupId") REFERENCES "QueryGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "scraperUrl" TEXT NOT NULL,
    "prowlerTag" TEXT NOT NULL,
    "indexers" TEXT NOT NULL,
    "targetQuality" TEXT NOT NULL,
    "searchFrequency" INTEGER NOT NULL,
    "includesRegex" TEXT NOT NULL,
    "excludesRegex" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "QueryResult" (
    "queryId" INTEGER NOT NULL,
    "guid" TEXT NOT NULL,

    PRIMARY KEY ("queryId", "guid"),
    CONSTRAINT "QueryResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "Query" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueryResult_guid_fkey" FOREIGN KEY ("guid") REFERENCES "Result" ("guid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "guid" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "magnet" TEXT NOT NULL,
    "info" TEXT NOT NULL,
    "seeders" INTEGER NOT NULL,
    "leechers" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "age" TEXT NOT NULL,
    "indexer" TEXT NOT NULL,
    "downloading" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT '',
    "infoHash" TEXT NOT NULL,
    CONSTRAINT "Result_infoHash_fkey" FOREIGN KEY ("infoHash") REFERENCES "Torrent" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Torrent" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "added_on" DATETIME NOT NULL,
    "total_size" INTEGER NOT NULL,
    "progress" REAL NOT NULL,
    "time_active" INTEGER NOT NULL,
    "num_seeds" INTEGER NOT NULL,
    "num_leechs" INTEGER NOT NULL,
    "availability" REAL NOT NULL,
    "completion_on" DATETIME NOT NULL,
    "dlspeed" INTEGER NOT NULL,
    "eta" INTEGER NOT NULL,
    "f_l_piece_prio" BOOLEAN NOT NULL,
    "force_start" BOOLEAN NOT NULL,
    "last_activity" DATETIME NOT NULL,
    "num_complete" INTEGER NOT NULL,
    "num_incomplete" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "save_path" TEXT NOT NULL,
    "seen_complete" DATETIME NOT NULL,
    "seq_dl" BOOLEAN NOT NULL,
    "size" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "tracker" TEXT NOT NULL,
    "upspeed" INTEGER NOT NULL,
    "piece_states" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TorrentContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "progress" REAL NOT NULL,
    "priority" INTEGER NOT NULL,
    "is_seed" BOOLEAN NOT NULL,
    "piece_range" TEXT NOT NULL,
    "availability" REAL NOT NULL,
    "hardlinkPath" TEXT NOT NULL,
    "torrentId" TEXT,
    CONSTRAINT "TorrentContent_torrentId_fkey" FOREIGN KEY ("torrentId") REFERENCES "Torrent" ("hash") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_QueryResults" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_QueryResults_A_fkey" FOREIGN KEY ("A") REFERENCES "Query" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_QueryResults_B_fkey" FOREIGN KEY ("B") REFERENCES "Result" ("guid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_QueryResults_AB_unique" ON "_QueryResults"("A", "B");

-- CreateIndex
CREATE INDEX "_QueryResults_B_index" ON "_QueryResults"("B");
