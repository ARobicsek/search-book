-- @-mentions in contact Notes and Idea descriptions (2026-08-04)
--
-- APPLY THIS IN THE TURSO WEB SQL CONSOLE **BEFORE** pushing the code that uses it.
-- (The rw token committed-but-commented in server/.env is stale and returns 401, so
-- the "uncomment the creds and run a libsql script" path does not work — dashboard only.)
--
-- Purely additive: one new table plus its indexes. Nothing existing is altered, so
-- it is safe to apply while the current build is live — the table just sits empty
-- until the new code ships.
--
-- Verify afterwards with:  SELECT COUNT(*) FROM "NoteMention";   → 0

CREATE TABLE "NoteMention" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceContactId" INTEGER,
    "sourceIdeaId" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'CONTACT',
    "contactId" INTEGER,
    "companyId" INTEGER,
    "mentionedName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteMention_sourceContactId_fkey" FOREIGN KEY ("sourceContactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteMention_sourceIdeaId_fkey" FOREIGN KEY ("sourceIdeaId") REFERENCES "Idea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteMention_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NoteMention_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "NoteMention_sourceContactId_idx" ON "NoteMention"("sourceContactId");
CREATE INDEX "NoteMention_sourceIdeaId_idx" ON "NoteMention"("sourceIdeaId");
CREATE INDEX "NoteMention_contactId_idx" ON "NoteMention"("contactId");
CREATE INDEX "NoteMention_companyId_idx" ON "NoteMention"("companyId");
