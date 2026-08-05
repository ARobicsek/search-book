// @-mentions inside note prose. The client's inline "@" autocomplete writes
// mention tokens into the text; this module parses them and keeps the mention
// index in sync so mentions are reviewable later.
//
// There are two index tables, one per source shape, sharing every parsing rule
// below: ConversationMention (a meeting's notes / next steps / prep notes) and
// NoteMention (a contact's `notes`, an idea's `description`). See the NoteMention
// model comment for why the second one is a separate table rather than nullable
// columns on the first.
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

// A mention target picked from the "@" picker in global search, as a URL-safe key:
//   contact:440  | company:5   → bound to a CRM record (an id, so it survives a
//                                rename and keeps two same-named people distinct)
//   person:anne marie smith    → a loose mention (a name that isn't a contact yet),
//   org:some org                 which can only ever be identified BY its name
// Returns null for an unparseable key, so a junk URL param degrades to "no filter"
// rather than a 500.
export type MentionTarget =
  | { bound: true; kind: MentionKind; id: number }
  | { bound: false; kind: MentionKind; name: string };

export function parseMentionTarget(raw: string | undefined): MentionTarget | null {
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep < 1) return null;
  const prefix = raw.slice(0, sep);
  const rest = raw.slice(sep + 1).trim();
  if (!rest) return null;

  if (prefix === 'contact' || prefix === 'company') {
    const id = Number(rest);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { bound: true, kind: prefix === 'company' ? 'COMPANY' : 'CONTACT', id };
  }
  if (prefix === 'person' || prefix === 'org') {
    return { bound: false, kind: prefix === 'org' ? 'COMPANY' : 'CONTACT', name: rest };
  }
  return null;
}

// The ConversationMention filter for a picked target. A loose mention is matched by
// name with `contains` because SQLite's LIKE is case-insensitive while Prisma's
// `equals` is not — the exact, case-insensitive name check is re-done in JS
// (mentionMatchesTarget), which is also what keeps a "Smith" key from matching
// "Smithson".
export function mentionTargetClause(target: MentionTarget): Record<string, unknown> {
  if (target.bound) {
    return target.kind === 'COMPANY' ? { companyId: target.id } : { contactId: target.id };
  }
  return {
    kind: target.kind,
    contactId: null,
    companyId: null,
    mentionedName: { contains: target.name },
  };
}

// Does this mention row actually point at the picked target? Pairs with
// mentionTargetClause to tighten its deliberately loose `contains` name match.
export function mentionMatchesTarget(
  mention: { contactId: number | null; companyId: number | null; kind: string; mentionedName: string },
  target: MentionTarget,
): boolean {
  if (target.bound) {
    return target.kind === 'COMPANY'
      ? mention.companyId === target.id
      : mention.contactId === target.id;
  }
  return (
    mention.contactId == null &&
    mention.companyId == null &&
    mention.kind === target.kind &&
    mention.mentionedName.trim().toLowerCase() === target.name.trim().toLowerCase()
  );
}

// Render mention tokens as plain "@Name" — the raw markdown token reads terribly
// in a search snippet. Term matching is unaffected: the display name survives the
// rewrite, so a text index into the rewritten string still lines up with a match.
export function humanizeMentions(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(MENTION_RE, (_token, name: string) => `@${name}`);
}

// Fields needed to render a meeting's display name, the @-mention chips on it, and
// the note context around them. Shared by the Mentions review page (routes/mentions.ts)
// and the "@-Mentions" group in global search (routes/search.ts) — both render the
// same card, so they need the same shape.
export const mentionMeetingSelect = {
  id: true,
  title: true,
  date: true,
  // Clock times: they order same-day items in the review feed, and they're what lets
  // it show the "Now" marker for a meeting in progress (same rule as the meetings list).
  startTime: true,
  endTime: true,
  datePrecision: true,
  type: true,
  notes: true,
  nextSteps: true,
  attendeesDescription: true,
  updatedAt: true,
  // Prep notes can hold @-mentions too; needed to snippet a prep-note-only mention.
  prepNotes: { select: { content: true } },
  series: { select: { name: true } },
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  participants: {
    select: { contact: { select: { id: true, name: true } } },
    orderBy: { ordering: 'asc' as const },
    take: 1,
  },
  tags: { select: { tag: { select: { id: true, name: true } } } },
  mentions: {
    select: {
      id: true,
      kind: true,
      mentionedName: true,
      contactId: true,
      contact: { select: { id: true, name: true, preferredName: true } },
      companyId: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' as const },
  },
};

// One mention row as the review/search surfaces render it. Deliberately the same
// field set as the `mentions` block of mentionMeetingSelect above — MentionChip
// takes either, so a note-sourced mention and a meeting-sourced one look alike.
export const noteMentionRowSelect = {
  id: true,
  kind: true,
  mentionedName: true,
  contactId: true,
  contact: { select: { id: true, name: true, preferredName: true } },
  companyId: true,
  company: { select: { id: true, name: true } },
};

// A contact / idea whose prose holds @-mentions, with the prose itself — the client
// windows the text around each mention (lib/mentions.ts `mentionSnippets`), exactly
// as it already does for meetings.
export const mentionContactSourceSelect = {
  id: true,
  name: true,
  preferredName: true,
  notes: true,
  updatedAt: true,
  noteMentionsInMyNotes: { select: noteMentionRowSelect, orderBy: { id: 'asc' as const } },
};

export const mentionIdeaSourceSelect = {
  id: true,
  title: true,
  description: true,
  archived: true,
  updatedAt: true,
  createdAt: true,
  mentions: { select: noteMentionRowSelect, orderBy: { id: 'asc' as const } },
};

// The uniform envelope both note sources are returned in, so one client component
// renders either. `text` is the prose the mentions were parsed from; `href` is where
// "open this" goes.
export type NoteMentionGroup = {
  sourceType: NoteMentionSourceType;
  sourceId: number;
  label: string;
  /** Only set for a CONTACT source — lets the client apply contactDisplayName(). */
  preferredName?: string | null;
  text: string | null;
  updatedAt: string | null;
  mentions: unknown[];
};

const isoOrNull = (d: Date | string | null | undefined): string | null =>
  d ? (typeof d === 'string' ? d : d.toISOString()) : null;

export function contactToNoteGroup(c: any): NoteMentionGroup {
  return {
    sourceType: 'CONTACT',
    sourceId: c.id,
    label: c.name,
    preferredName: c.preferredName ?? null,
    text: c.notes ?? null,
    updatedAt: isoOrNull(c.updatedAt),
    mentions: c.noteMentionsInMyNotes ?? [],
  };
}

export function ideaToNoteGroup(i: any): NoteMentionGroup {
  return {
    sourceType: 'IDEA',
    sourceId: i.id,
    label: i.title,
    text: i.description ?? null,
    // Idea.updatedAt is nullable (see the model comment) — fall back to createdAt so
    // sorting never drops a pre-backfill row to the bottom.
    updatedAt: isoOrNull(i.updatedAt ?? i.createdAt),
    mentions: i.mentions ?? [],
  };
}

// Newest-touched first, matching the meetings list's reverse-chronological feel.
export function sortNoteGroups(groups: NoteMentionGroup[]): NoteMentionGroup[] {
  return groups.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
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

// The same, for the NoteMention index (contact notes / idea descriptions).
type NoteMentionDb = {
  noteMention: {
    deleteMany(args: any): Promise<unknown>;
    create(args: any): Promise<unknown>;
  };
  contact: { findMany(args: any): Promise<{ id: number }[]> };
  company: { findMany(args: any): Promise<{ id: number }[]> };
};

// A mention row's target columns, after the ids have been checked against the DB.
type ResolvedTarget = {
  kind: MentionKind;
  contactId: number | null;
  companyId: number | null;
  mentionedName: string;
};

// FK-safety: a token may reference a contact/company that no longer exists (e.g.
// deleted after the note was written) — those degrade to LOOSE mentions rather
// than blowing up the insert. The name is preserved either way. Shared by both
// index tables so they degrade identically.
async function resolveTargets(
  db: { contact: { findMany(args: any): Promise<{ id: number }[]> }; company: { findMany(args: any): Promise<{ id: number }[]> } },
  parsed: ParsedMention[],
): Promise<ResolvedTarget[]> {
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

  return parsed.map((p) => ({
    kind: p.kind,
    contactId: p.contactId != null && existingContactIds.has(p.contactId) ? p.contactId : null,
    companyId: p.companyId != null && existingCompanyIds.has(p.companyId) ? p.companyId : null,
    mentionedName: p.name,
  }));
}

// Which record's prose holds a NoteMention. Exactly one field is set — the two
// source FKs on the table are mutually exclusive (see the model comment).
export type NoteMentionSource = { contactId: number } | { ideaId: number };

export type NoteMentionSourceType = 'CONTACT' | 'IDEA';

// Does this text hold at least one mention token? Lets a BULK writer skip the
// per-row sync entirely for text that can't produce mentions (a spreadsheet's
// notes column, almost always), instead of spending a query per row inside an
// import that already has a tight function-timeout budget.
export function hasMentionToken(text: string | null | undefined): boolean {
  if (!text) return false;
  MENTION_RE.lastIndex = 0;
  return MENTION_RE.test(text);
}

export function noteSourceType(source: NoteMentionSource): NoteMentionSourceType {
  return 'contactId' in source ? 'CONTACT' : 'IDEA';
}

// The NoteMention columns identifying `source`, used both as the `where` for a
// re-sync's delete and as the `data` for its inserts.
export function noteSourceColumns(source: NoteMentionSource): {
  sourceContactId: number | null;
  sourceIdeaId: number | null;
} {
  return 'contactId' in source
    ? { sourceContactId: source.contactId, sourceIdeaId: null }
    : { sourceContactId: null, sourceIdeaId: source.ideaId };
}

// Replace the mention rows for one note source with the ones currently in `text`
// (a contact's `notes`, an idea's `description`). Same derive-from-the-text
// contract as syncConversationMentions: delete-all for that source, re-create.
export async function syncNoteMentions(
  db: NoteMentionDb,
  source: NoteMentionSource,
  text: string | null | undefined,
): Promise<void> {
  const columns = noteSourceColumns(source);
  const parsed = parseMentions(text);
  // Match on the ONE set source column. A `where: columns` would also require the
  // other column to be null — true today, but an explicit single-column filter says
  // what is meant and can't be broken by a future third source type.
  await db.noteMention.deleteMany({
    where:
      columns.sourceContactId != null
        ? { sourceContactId: columns.sourceContactId }
        : { sourceIdeaId: columns.sourceIdeaId },
  });
  if (parsed.length === 0) return;

  for (const target of await resolveTargets(db, parsed)) {
    await db.noteMention.create({ data: { ...columns, ...target } });
  }
}

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

  for (const target of await resolveTargets(db, parsed)) {
    await db.conversationMention.create({ data: { conversationId, ...target } });
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
