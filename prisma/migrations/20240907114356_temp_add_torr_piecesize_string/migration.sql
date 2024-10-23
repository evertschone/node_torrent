-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TorrentContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "progress" REAL NOT NULL,
    "priority" INTEGER NOT NULL,
    "is_seed" BOOLEAN NOT NULL,
    "piece_range" TEXT NOT NULL,
    "piece_size" TEXT NOT NULL DEFAULT '1024',
    "availability" REAL NOT NULL,
    "hardlinkPath" TEXT NOT NULL,
    "torrentId" TEXT,
    CONSTRAINT "TorrentContent_torrentId_fkey" FOREIGN KEY ("torrentId") REFERENCES "Torrent" ("hash") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TorrentContent" ("availability", "hardlinkPath", "id", "is_seed", "name", "piece_range", "priority", "progress", "size", "torrentId") SELECT "availability", "hardlinkPath", "id", "is_seed", "name", "piece_range", "priority", "progress", "size", "torrentId" FROM "TorrentContent";
DROP TABLE "TorrentContent";
ALTER TABLE "new_TorrentContent" RENAME TO "TorrentContent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
