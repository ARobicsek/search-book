// @-mentions inside meeting notes. The client's inline "@" autocomplete writes
// mention tokens into the note text; this module parses them and keeps the
// ConversationMention index in sync so mentions are reviewable later.
//
// Token format (valid markdown, so it degrades gracefully at any render site):
//   [@Display Name](/contacts/123)  → resolved person mention (bound to contact 123)
//   [@Org Name](/companies/45)      → resolved org mention (bound to company 45)
//   [@Display Name](#mention)       → loose person mention (a name not yet a contact)
//   [@Org Name](#org-mention)       → loose org mention (an org not yet a company)
//
// Mentions are DERIVED from the text: on every conversation save we delete the
// meeting's rows and recreate them from the current tokens — the note text stays
// the single source of truth (no separate state to keep in sync).

export const MENTION_RE =
  /\[@([^\]\n]+)\]\((\/contacts\/(\d+)|\/companies\/(\d+)|#mention|#org-mention)\)/g;

export type MentionKind = 'CONTACT' | 'COMPANY';
export type ParsedMention = {
  name: string;
  kind: MentionKind;
  contactId: number | null;
  companyId: number | null;
};

// The token written for a loose (not-yet-a-contact) mention of a person.
export function looseMentionToken(name: string): string {
  return `[@${name}](#mention)`;
}

// The token written for a mention bound to an existing contact.
export function resolvedMentionToken(name: string, contactId: number): string {
  return `[@${name}](/contacts/${contactId})`;
}

// The token written for a loose (not-yet-a-company) mention of an organization.
export function looseOrgMentionToken(name: string): string {
  return `[@${name}](#org-mention)`;
}

// The token written for a mention bound to an existing organization.
export function resolvedOrgMentionToken(name: string, companyId: number): string {
  return `[@${name}](/companies/${companyId})`;
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
    const companyId = m[4] ? Number(m[4]) : null;
    const href = m[2];
    const kind: MentionKind =
      companyId != null || href === '#org-mention' ? 'COMPANY' : 'CONTACT';
    // De-dupe identical mentions within one meeting (kind + id + name).
    const key = `${kind}|${contactId ?? companyId ?? 'loose'}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, kind, contactId, companyId });
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
  company: { findMany(args: any): Promise<{ id: number }[]> };
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

  // FK-safety: a token may reference a contact/company that no longer exists
  // (e.g. deleted after the note was written) — degrade those to loose mentions.
  const contactIds = [...new Set(parsed.map((p) => p.contactId).filter((x): x is number => x != null))];
  const existingContactIds = contactIds.length
    ? new Set(
        (await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true } })).map((c) => c.id),
      )
    : new Set<number>();
  const companyIds = [...new Set(parsed.map((p) => p.companyId).filter((x): x is number => x != null))];
  const existingCompanyIds = companyIds.length
    ? new Set(
        (await db.company.findMany({ where: { id: { in: companyIds } }, select: { id: true } })).map((c) => c.id),
      )
    : new Set<number>();

  for (const p of parsed) {
    const contactId = p.contactId != null && existingContactIds.has(p.contactId) ? p.contactId : null;
    const companyId = p.companyId != null && existingCompanyIds.has(p.companyId) ? p.companyId : null;
    await db.conversationMention.create({
      data: { conversationId, kind: p.kind, contactId, companyId, mentionedName: p.name },
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
