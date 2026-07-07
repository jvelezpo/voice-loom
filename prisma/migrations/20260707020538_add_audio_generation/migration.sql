-- CreateTable
CREATE TABLE "AudioGeneration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "textEntryId" INTEGER NOT NULL,
    "voiceKey" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AudioGeneration_textEntryId_fkey" FOREIGN KEY ("textEntryId") REFERENCES "TextEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioGeneration_textEntryId_voiceKey_key" ON "AudioGeneration"("textEntryId", "voiceKey");
