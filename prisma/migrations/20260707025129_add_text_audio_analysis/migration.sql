-- CreateTable
CREATE TABLE "AudioTextAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "textEntryId" INTEGER NOT NULL,
    "languageCode" TEXT NOT NULL,
    "languageName" TEXT NOT NULL,
    "charactersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudioTextAnalysis_textEntryId_fkey" FOREIGN KEY ("textEntryId") REFERENCES "TextEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioTextAnalysis_textEntryId_key" ON "AudioTextAnalysis"("textEntryId");
