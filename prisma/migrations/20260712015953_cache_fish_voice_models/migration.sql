-- CreateTable
CREATE TABLE "FishVoiceModel" (
    "referenceId" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "languagesJson" TEXT NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FishVoiceSync" (
    "languageCode" TEXT NOT NULL PRIMARY KEY,
    "refreshedAt" DATETIME NOT NULL
);
