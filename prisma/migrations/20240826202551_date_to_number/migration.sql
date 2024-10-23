/*
  Warnings:

  - You are about to alter the column `added_on` on the `Torrent` table. The data in that column could be lost. The data in that column will be cast from `DateTime` to `Int`.
  - You are about to alter the column `completion_on` on the `Torrent` table. The data in that column could be lost. The data in that column will be cast from `DateTime` to `Int`.
  - You are about to alter the column `last_activity` on the `Torrent` table. The data in that column could be lost. The data in that column will be cast from `DateTime` to `Int`.
  - You are about to alter the column `seen_complete` on the `Torrent` table. The data in that column could be lost. The data in that column will be cast from `DateTime` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Torrent" (
    "hash" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "added_on" INTEGER NOT NULL,
    "total_size" INTEGER NOT NULL,
    "progress" REAL NOT NULL,
    "time_active" INTEGER NOT NULL,
    "num_seeds" INTEGER NOT NULL,
    "num_leechs" INTEGER NOT NULL,
    "availability" REAL NOT NULL,
    "completion_on" INTEGER NOT NULL,
    "dlspeed" INTEGER NOT NULL,
    "eta" INTEGER NOT NULL,
    "f_l_piece_prio" BOOLEAN NOT NULL,
    "force_start" BOOLEAN NOT NULL,
    "last_activity" INTEGER NOT NULL,
    "num_complete" INTEGER NOT NULL,
    "num_incomplete" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "save_path" TEXT NOT NULL,
    "seen_complete" INTEGER NOT NULL,
    "seq_dl" BOOLEAN NOT NULL,
    "size" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "tracker" TEXT NOT NULL,
    "upspeed" INTEGER NOT NULL,
    "piece_states" TEXT NOT NULL
);
INSERT INTO "new_Torrent" ("added_on", "availability", "category", "completion_on", "dlspeed", "eta", "f_l_piece_prio", "force_start", "hash", "last_activity", "name", "num_complete", "num_incomplete", "num_leechs", "num_seeds", "piece_states", "priority", "progress", "save_path", "seen_complete", "seq_dl", "size", "state", "tags", "time_active", "total_size", "tracker", "upspeed") SELECT "added_on", "availability", "category", "completion_on", "dlspeed", "eta", "f_l_piece_prio", "force_start", "hash", "last_activity", "name", "num_complete", "num_incomplete", "num_leechs", "num_seeds", "piece_states", "priority", "progress", "save_path", "seen_complete", "seq_dl", "size", "state", "tags", "time_active", "total_size", "tracker", "upspeed" FROM "Torrent";
DROP TABLE "Torrent";
ALTER TABLE "new_Torrent" RENAME TO "Torrent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
