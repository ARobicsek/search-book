// @-mentions inside meeting notes. The client's inline "@" autocomplete writes
// mention tokens into the note text; this module parses them and keeps the
// ConversationMention index in sync so mentions are reviewable later.
//
// Token format (valid markdown, so it degrades gracefully at any render site):
//   [@Display Name](/contacts/123)  → resolved mention (bound to contact 123)
//   [@Display Name](#mention)       → loose mention (a name not yet a contact)
//
// Mentions are DERIVED from the text: on every conversation save we delete the
// meeting's rows and recreate them from the current tokens — the note text stays
// the single source of truth (no separate state to keep in sync).

export const MENTION_RE = /\[@([^\]\n]+)\]\((\/contacts\/(\d+)|#mention)\)/g;

export type ParsedMention = { name: string; contactId: number | null };

// The token written for a loose (not-yet-a-contact) mention of `name`.
export function looseMentionToken(name: string): string {
  return `[@${name}](#mention)`;
}

// The token written for a mention bound to an existing contact.
export function resolvedMentionToken(name: string, contactId: number): string {
  return `[@${name}](/contacts/${contactId})`;
}

export function parseMentions(text: string | null | undefined): ParsedMention[] {
  if (!text) return [];
  const out: ParsedMention[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    const contactId = m[3] ? Number(m[3]) : null;
    // De-dupe identical (name, contactId) pairs within one meeting.
    const key = `${contactId ?? 'loose'}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, contactId });
  }
  return out;
}

// Loose structural type so this works with both the long-lived PrismaClient proxy
// and a `$transaction` client (their generated types are heavily overloaded).
type MentionDb = {
  conversationMention: {
    deleteMany(args: any): Promise<unknown>;
    create(args: any): Promise<unknown>;
  };
  contact: { findMany(args: any): Promise<{ id: number }[]> };
};

// Like MentionDb but also able to read the text that feeds the index.
type ResyncDb = MentionDb & {
  conversation: { findUnique(args: any): Promise<{ notes: string | null; nextSteps: string | null } | null> };
  conversationPrepNote: { findMany(args: any): Promise<{ content: string | null }[]> };
};

// Replace the meeting's mention rows with the ones currently in `text`
// (notes + next steps). contactIds that no longer exist degrade to loose mentions
// (FK-safe) — the name is preserved either way.
export async function syncConversationMentions(
  db: MentionDb,
  conversationId: number,
  text: string | null | undefined,
): Promise<void> {
  const parsed = parseMentions(text);
  await db.conversationMention.deleteMany({ where: { conversationId } });
  if (parsed.length === 0) return;

  const ids = [...new Set(parsed.map((p) => p.contactId).filter((x): x is number => x != null))];
  const existingIds = ids.length
    ? new Set(
        (await db.contact.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((c) => c.id),
      )
    : new Set<number>();

  for (const p of parsed) {
    const contactId = p.contactId != null && existingIds.has(p.contactId) ? p.contactId : null;
    await db.conversationMention.create({
      data: { conversationId, contactId, mentionedName: p.name },
    });
  }
}

// Re-derive a meeting's mention index from ALL of its mention-bearing text:
// notes + next steps (on the Conversation row) AND every prep note. Use this
// whenever any of those change so prep-note mentions stay in the index too.
export async function resyncConversationMentions(
  db: ResyncDb,
  conversationId: number,
): Promise<void> {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { notes: true, nextSteps: true },
  });
  const preps = await db.conversationPrepNote.findMany({
    where: { conversationId },
    select: { content: true },
  });
  const text = [conv?.notes, conv?.nextSteps, ...preps.map((p) => p.content)]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join('\n\n');
  await syncConversationMentions(db, conversationId, text);
}
