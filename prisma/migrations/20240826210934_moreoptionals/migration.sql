/*
  Warnings:

  - Made the column `link` on table `Result` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Result" (
    "guid" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "magnet" TEXT,
    "info" TEXT,
    "seeders" INTEGER,
    "leechers" INTEGER,
    "size" INTEGER,
    "age" TEXT,
    "indexer" TEXT,
    "downloading" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT '',
    "infoHash" TEXT,
    CONSTRAINT "Result_infoHash_fkey" FOREIGN KEY ("infoHash") REFERENCES "Torrent" ("hash") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Result" ("age", "downloading", "guid", "indexer", "info", "infoHash", "leechers", "link", "magnet", "seeders", "size", "state", "title") SELECT "age", "downloading", "guid", "indexer", "info", "infoHash", "leechers", "link", "magnet", "seeders", "size", "state", "title" FROM "Result";
DROP TABLE "Result";
ALTER TABLE "new_Result" RENAME TO "Result";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
