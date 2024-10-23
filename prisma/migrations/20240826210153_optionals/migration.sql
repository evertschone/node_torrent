-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Query" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "searchQuery" TEXT NOT NULL,
    "prowlerTag" TEXT,
    "targetQuality" TEXT,
    "searchFrequency" INTEGER,
    "includesRegex" TEXT,
    "excludesRegex" TEXT,
    "loopRunning" BOOLEAN NOT NULL DEFAULT false,
    "downloadComplete" BOOLEAN NOT NULL DEFAULT false,
    "queryGroupId" INTEGER,
    CONSTRAINT "Query_queryGroupId_fkey" FOREIGN KEY ("queryGroupId") REFERENCES "QueryGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Query" ("downloadComplete", "excludesRegex", "id", "includesRegex", "loopRunning", "prowlerTag", "queryGroupId", "searchFrequency", "searchQuery", "targetQuality") SELECT "downloadComplete", "excludesRegex", "id", "includesRegex", "loopRunning", "prowlerTag", "queryGroupId", "searchFrequency", "searchQuery", "targetQuality" FROM "Query";
DROP TABLE "Query";
ALTER TABLE "new_Query" RENAME TO "Query";
CREATE TABLE "new_QueryGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "scraperUrl" TEXT,
    "prowlerTag" TEXT,
    "indexers" TEXT,
    "targetQuality" TEXT,
    "searchFrequency" INTEGER,
    "includesRegex" TEXT,
    "excludesRegex" TEXT
);
INSERT INTO "new_QueryGroup" ("excludesRegex", "id", "includesRegex", "indexers", "name", "prowlerTag", "scraperUrl", "searchFrequency", "sourceUrl", "targetQuality") SELECT "excludesRegex", "id", "includesRegex", "indexers", "name", "prowlerTag", "scraperUrl", "searchFrequency", "sourceUrl", "targetQuality" FROM "QueryGroup";
DROP TABLE "QueryGroup";
ALTER TABLE "new_QueryGroup" RENAME TO "QueryGroup";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
