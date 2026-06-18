-- Turso production DDL for org @-mentions (Task 3, commit cd2bfdc).
-- Run via the Turso web SQL console (the committed rw token in server/.env is stale).
-- Take a backup first (Settings → Create Backup). All three are safe additive statements.
-- Mirrors what was applied to local SQLite (server/prisma/dev.db) during development.

ALTER TABLE "ConversationMention" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CONTACT';
ALTER TABLE "ConversationMention" ADD COLUMN "companyId" INTEGER REFERENCES "Company"("id") ON DELETE SET NULL;
CREATE INDEX "ConversationMention_companyId_idx" ON "ConversationMention"("companyId");

-- After this is applied, push the held commit:  git push origin main
