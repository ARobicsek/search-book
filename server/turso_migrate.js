require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
    url: "libsql://searchbook-arobicsek.aws-us-east-2.turso.io",
    authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzAyOTg3MTIsImlkIjoiNzEyNWNmYmEtODIxZi00ZDc4LTliYjgtMDhjNzNlZTUyMmU5IiwicmlkIjoiZDIyZDBkNGItNmUxNC00N2Q3LTk0MzQtYzQ4ZDUyMjgzNDY1In0.TkuFIE6JGbh9HnjX5tL0VN-9kqzUZkL93apG_7tDgG50ArqtBhdD0GmImsDq0IhMWsxwmgzOzB7yMf9oA0J9Bw"
});

async function run() {
    await client.execute(`
    CREATE TABLE IF NOT EXISTS "ConversationParticipant" (
      "conversationId" INTEGER NOT NULL,
      "contactId" INTEGER NOT NULL,
      PRIMARY KEY ("conversationId", "contactId"),
      CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ConversationParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
    console.log('Migration complete');
}

run().catch(console.error);
