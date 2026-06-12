import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// ─── Scopes ──────────────────────────────────────────────────
// User-selectable groups of fields (SEARCH-UPGRADE-PLAN.md decision 3).
// "people-profile" vs "people-notes" split lets "Boston" find people located
// in Boston without drowning in every meeting note that mentions Boston.

type Scope = 'people-profile' | 'people-notes' | 'orgs' | 'meetings' | 'actions' | 'ideas';
const ALL_SCOPES: Scope[] = ['people-profile', 'people-notes', 'orgs', 'meetings', 'actions', 'ideas'];

type SortMode = 'relevance' | 'newest' | 'oldest' | 'alpha' | 'recent-contact';

// ─── Term parsing ────────────────────────────────────────────
// Multi-term = AND across terms; each term may match a different field of the
// same record. Quoted phrases ("digital measures") are kept whole.

function parseTerms(q: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    const t = (m[1] ?? m[2]).trim();
    if (t) terms.push(t);
  }
  return terms;
}

// ─── Match evidence ──────────────────────────────────────────
// Each hit reports WHY it matched: field name + a snippet around the first
// match. Computed in JS after fetch (the server has the full text; the
// response payload stays small). Also where case-sensitive filtering happens:
// SQLite LIKE is case-insensitive for ASCII, so the DB returns a superset and
// records with no case-sensitive match get dropped here.

interface FieldVal {
  field: string;
  value: string;
  weight: number; // 3 = name/title, 2 = tag, 1 = other
}

interface MatchEvidence {
  field: string;
  snippet: string;
}

const SNIPPET_RADIUS = 60;

function makeSnippet(value: string, idx: number, termLen: number): string {
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(value.length, idx + termLen + SNIPPET_RADIUS);
  let snippet = value.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < value.length) snippet = snippet + '…';
  return snippet;
}

function indexOfTerm(value: string, term: string, caseSensitive: boolean): number {
  return caseSensitive
    ? value.indexOf(term)
    : value.toLowerCase().indexOf(term.toLowerCase());
}

/**
 * Verify every term matches some field (AND semantics, honoring case
 * sensitivity), and collect match evidence + a relevance score.
 * Returns null when the record should be dropped.
 */
function evaluateRecord(
  fields: FieldVal[],
  terms: string[],
  caseSensitive: boolean
): { matches: MatchEvidence[]; score: number } | null {
  let score = 0;
  const matchedFields = new Map<string, MatchEvidence>();

  for (const term of terms) {
    let best: { weight: number; field: FieldVal; idx: number } | null = null;
    for (const f of fields) {
      const idx = indexOfTerm(f.value, term, caseSensitive);
      if (idx === -1) continue;
      if (!best || f.weight > best.weight) best = { weight: f.weight, field: f, idx };
      // Record evidence for every field this term matches (first 3 fields overall)
      if (!matchedFields.has(f.field)) {
        matchedFields.set(f.field, { field: f.field, snippet: makeSnippet(f.value, idx, term.length) });
      }
    }
    if (!best) return null; // a term matched nothing → record fails the AND
    score += best.weight;
  }

  return { matches: Array.from(matchedFields.values()).slice(0, 3), score };
}

function pushField(fields: FieldVal[], field: string, value: string | null | undefined, weight: number) {
  if (value && value.trim()) fields.push({ field, value, weight });
}

// ─── Sorting ─────────────────────────────────────────────────

interface Scored {
  score: number;
  recency: string; // ISO-ish string; '' sorts last
  alpha: string;
}

function sortRecords<T extends { _s: Scored }>(records: T[], sort: SortMode): T[] {
  const byRecency = (a: T, b: T) => (b._s.recency || '').localeCompare(a._s.recency || '');
  switch (sort) {
    case 'newest':
    case 'recent-contact': // groups without a contact-date fall back to newest
      return records.sort(byRecency);
    case 'oldest':
      return records.sort((a, b) => byRecency(b, a));
    case 'alpha':
      return records.sort((a, b) => a._s.alpha.localeCompare(b._s.alpha, undefined, { sensitivity: 'base' }));
    case 'relevance':
    default:
      return records.sort((a, b) => b._s.score - a._s.score || byRecency(a, b));
  }
}

// GET /api/search?q=term&limit=20&includeRelated=true&scopes=...&sort=...&caseSensitive=true
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, limit = '10', includeRelated = 'true' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const terms = parseTerms(q.trim());
    if (terms.length === 0) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const maxResults = Math.min(parseInt(limit as string) || 10, 50);
    const fetchRelated = includeRelated === 'true';
    const caseSensitive = req.query.caseSensitive === 'true';
    // Case-sensitive mode filters in JS after an insensitive DB fetch, so fetch
    // a bigger superset to compensate for dropped rows.
    const take = caseSensitive ? Math.min(maxResults * 3, 100) : maxResults;

    const sort: SortMode = (['relevance', 'newest', 'oldest', 'alpha', 'recent-contact'] as const).includes(
      req.query.sort as SortMode
    )
      ? (req.query.sort as SortMode)
      : 'relevance';

    const scopesParam = typeof req.query.scopes === 'string' && req.query.scopes.trim()
      ? (req.query.scopes.split(',').map((s) => s.trim()) as Scope[]).filter((s) => ALL_SCOPES.includes(s))
      : ALL_SCOPES;
    const scopes = new Set<Scope>(scopesParam.length ? scopesParam : ALL_SCOPES);

    const peopleProfile = scopes.has('people-profile');
    const peopleNotes = scopes.has('people-notes');

    const tStart = Date.now();

    // Per-term company-name lookup: contacts affiliated with a company via the
    // additionalCompanyIds/connectedCompanyIds JSON fields should match when the
    // company's NAME matches a term (longstanding behavior, now per-term).
    const termCompanies = new Map<string, { id: number; name: string }[]>();
    if (peopleProfile) {
      for (const term of terms) {
        const matched = await prisma.company.findMany({
          where: { name: { contains: term } },
          select: { id: true, name: true },
          take: 25,
        });
        termCompanies.set(term, matched);
      }
    }

    // ── Contacts ─────────────────────────────────────────────
    const contactClausesFor = (term: string): Record<string, unknown>[] => {
      const clauses: Record<string, unknown>[] = [];
      if (peopleProfile) {
        clauses.push(
          { name: { contains: term } },
          { title: { contains: term } },
          { email: { contains: term } },
          { additionalEmails: { contains: term } },
          { phone: { contains: term } },
          { linkedinUrl: { contains: term } },
          { location: { contains: term } },
          { roleDescription: { contains: term } },
          { howConnected: { contains: term } },
          { whereFound: { contains: term } },
          { companyName: { contains: term } },
          { company: { name: { contains: term } } },
          { employmentHistory: { some: { companyName: { contains: term } } } },
          { employmentHistory: { some: { company: { name: { contains: term } } } } },
          { employmentHistory: { some: { title: { contains: term } } } },
          { tags: { some: { tag: { name: { contains: term } } } } },
        );
        for (const c of termCompanies.get(term) || []) {
          clauses.push({ additionalCompanyIds: { contains: `${c.id}` } });
          clauses.push({ connectedCompanyIds: { contains: `${c.id}` } });
        }
      }
      if (peopleNotes) {
        clauses.push(
          { notes: { contains: term } },
          { personalDetails: { contains: term } },
          { openQuestions: { contains: term } },
          { mutualConnections: { contains: term } },
          { prepNotes: { some: { content: { contains: term } } } },
        );
      }
      return clauses;
    };

    let contacts: any[] = [];
    if (peopleProfile || peopleNotes) {
      contacts = await prisma.contact.findMany({
        where: { AND: terms.map((t) => ({ OR: contactClausesFor(t) })) },
        select: {
          id: true, name: true, title: true, ecosystem: true, status: true, updatedAt: true,
          email: true, additionalEmails: true, phone: true, linkedinUrl: true, location: true,
          roleDescription: true, howConnected: true, whereFound: true, companyName: true,
          notes: true, personalDetails: true, openQuestions: true, mutualConnections: true,
          additionalCompanyIds: true, connectedCompanyIds: true, referredById: true,
          company: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { name: true } } } },
          prepNotes: { select: { content: true }, take: 20 },
          employmentHistory: { select: { companyName: true, title: true, company: { select: { name: true } } } },
        },
        take,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const collectContactFields = (c: any): FieldVal[] => {
      const fields: FieldVal[] = [];
      if (peopleProfile) {
        pushField(fields, 'name', c.name, 3);
        pushField(fields, 'title', c.title, 3);
        for (const t of c.tags || []) pushField(fields, 'tag', t.tag.name, 2);
        pushField(fields, 'email', c.email, 1);
        pushField(fields, 'email', parseJsonStrings(c.additionalEmails), 1);
        pushField(fields, 'phone', c.phone, 1);
        pushField(fields, 'LinkedIn', c.linkedinUrl, 1);
        pushField(fields, 'location', c.location, 1);
        pushField(fields, 'role', c.roleDescription, 1);
        pushField(fields, 'how connected', c.howConnected, 1);
        pushField(fields, 'where found', c.whereFound, 1);
        pushField(fields, 'company', c.companyName, 1);
        pushField(fields, 'company', c.company?.name, 1);
        for (const eh of c.employmentHistory || []) {
          pushField(fields, 'employment history', eh.company?.name || eh.companyName, 1);
          pushField(fields, 'employment history', eh.title, 1);
        }
        // Affiliated companies via JSON id lists: synthesize a field carrying the
        // company name so term verification and snippets line up with the DB clause.
        const affiliatedIds = new Set<number>([
          ...parseJsonIds(c.additionalCompanyIds),
          ...parseJsonIds(c.connectedCompanyIds),
        ]);
        if (affiliatedIds.size > 0) {
          const seen = new Set<number>();
          for (const list of termCompanies.values()) {
            for (const comp of list) {
              if (affiliatedIds.has(comp.id) && !seen.has(comp.id)) {
                seen.add(comp.id);
                pushField(fields, 'affiliated company', comp.name, 1);
              }
            }
          }
        }
      }
      if (peopleNotes) {
        pushField(fields, 'notes', c.notes, 1);
        pushField(fields, 'personal details', c.personalDetails, 1);
        pushField(fields, 'open questions', c.openQuestions, 1);
        pushField(fields, 'mutual connections', c.mutualConnections, 1);
        for (const pn of c.prepNotes || []) pushField(fields, 'prep note', pn.content, 1);
      }
      return fields;
    };

    // ── Companies ────────────────────────────────────────────
    const companyClausesFor = (term: string): Record<string, unknown>[] => [
      { name: { contains: term } },
      { industry: { contains: term } },
      { website: { contains: term } },
      { hqLocation: { contains: term } },
      { size: { contains: term } },
      { notes: { contains: term } },
      { tags: { some: { tag: { name: { contains: term } } } } },
      { activities: { some: { title: { contains: term } } } },
      { activities: { some: { notes: { contains: term } } } },
      { companyPrepNotes: { some: { content: { contains: term } } } },
    ];

    let companies: any[] = [];
    if (scopes.has('orgs')) {
      companies = await prisma.company.findMany({
        where: { AND: terms.map((t) => ({ OR: companyClausesFor(t) })) },
        select: {
          id: true, name: true, industry: true, status: true, updatedAt: true,
          website: true, hqLocation: true, size: true, notes: true,
          tags: { select: { tag: { select: { name: true } } } },
          activities: { select: { title: true, notes: true }, orderBy: { date: 'desc' }, take: 25 },
          companyPrepNotes: { select: { content: true }, take: 20 },
        },
        take,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const collectCompanyFields = (c: any): FieldVal[] => {
      const fields: FieldVal[] = [];
      pushField(fields, 'name', c.name, 3);
      for (const t of c.tags || []) pushField(fields, 'tag', t.tag.name, 2);
      pushField(fields, 'industry', c.industry, 1);
      pushField(fields, 'website', c.website, 1);
      pushField(fields, 'HQ location', c.hqLocation, 1);
      pushField(fields, 'size', c.size, 1);
      pushField(fields, 'notes', c.notes, 1);
      for (const a of c.activities || []) {
        pushField(fields, 'activity log', a.title, 1);
        pushField(fields, 'activity log', a.notes, 1);
      }
      for (const pn of c.companyPrepNotes || []) pushField(fields, 'prep note', pn.content, 1);
      return fields;
    };

    // ── Meetings / conversations ─────────────────────────────
    const conversationClausesFor = (term: string): Record<string, unknown>[] => [
      { title: { contains: term } },
      { summary: { contains: term } },
      { notes: { contains: term } },
      { nextSteps: { contains: term } },
      { attendeesDescription: { contains: term } },
      { tags: { some: { tag: { name: { contains: term } } } } },
      { prepNotes: { some: { content: { contains: term } } } },
      { attachments: { some: { name: { contains: term } } } },
      { contact: { name: { contains: term } } },
      { company: { name: { contains: term } } },
      { orgs: { some: { company: { name: { contains: term } } } } },
      { participants: { some: { contact: { name: { contains: term } } } } },
      { participants: { some: { note: { contains: term } } } },
      { contactsDiscussed: { some: { contact: { name: { contains: term } } } } },
      { companiesDiscussed: { some: { company: { name: { contains: term } } } } },
    ];

    let conversations: any[] = [];
    if (scopes.has('meetings')) {
      conversations = await prisma.conversation.findMany({
        where: { AND: terms.map((t) => ({ OR: conversationClausesFor(t) })) },
        select: {
          id: true, title: true, summary: true, notes: true, nextSteps: true,
          attendeesDescription: true, date: true, type: true,
          contact: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          orgs: { select: { company: { select: { name: true } } } },
          tags: { select: { tag: { select: { name: true } } } },
          prepNotes: { select: { content: true }, take: 20 },
          attachments: { select: { name: true } },
          participants: { select: { note: true, contact: { select: { name: true } } } },
          contactsDiscussed: { select: { contact: { select: { name: true } } } },
          companiesDiscussed: { select: { company: { select: { name: true } } } },
        },
        take,
        orderBy: { date: 'desc' },
      });
    }

    const collectConversationFields = (c: any): FieldVal[] => {
      const fields: FieldVal[] = [];
      pushField(fields, 'title', c.title, 3);
      for (const t of c.tags || []) pushField(fields, 'tag', t.tag.name, 2);
      pushField(fields, 'summary', c.summary, 1);
      pushField(fields, 'notes', c.notes, 1);
      pushField(fields, 'next steps', c.nextSteps, 1);
      pushField(fields, 'attendees', c.attendeesDescription, 1);
      pushField(fields, 'contact', c.contact?.name, 1);
      pushField(fields, 'organization', c.company?.name, 1);
      for (const o of c.orgs || []) pushField(fields, 'organization', o.company.name, 1);
      for (const p of c.participants || []) {
        pushField(fields, 'participant', p.contact.name, 1);
        pushField(fields, 'takeaway', p.note, 1);
      }
      for (const cd of c.contactsDiscussed || []) pushField(fields, 'person discussed', cd.contact.name, 1);
      for (const cd of c.companiesDiscussed || []) pushField(fields, 'org discussed', cd.company.name, 1);
      for (const pn of c.prepNotes || []) pushField(fields, 'prep note', pn.content, 1);
      for (const a of c.attachments || []) pushField(fields, 'attachment', a.name, 1);
      return fields;
    };

    // ── Actions ──────────────────────────────────────────────
    const actionClausesFor = (term: string): Record<string, unknown>[] => [
      { title: { contains: term } },
      { description: { contains: term } },
      { contact: { name: { contains: term } } },
      { actionContacts: { some: { contact: { name: { contains: term } } } } },
      { company: { name: { contains: term } } },
      { actionCompanies: { some: { company: { name: { contains: term } } } } },
      { contact: { company: { name: { contains: term } } } },
      { contact: { companyName: { contains: term } } },
    ];

    let actions: any[] = [];
    if (scopes.has('actions')) {
      actions = await prisma.action.findMany({
        where: { AND: terms.map((t) => ({ OR: actionClausesFor(t) })) },
        select: {
          id: true, title: true, description: true, type: true, completed: true,
          dueDate: true, updatedAt: true,
          contact: { select: { id: true, name: true, companyName: true, company: { select: { name: true } } } },
          company: { select: { id: true, name: true } },
          actionContacts: { select: { contact: { select: { name: true } } } },
          actionCompanies: { select: { company: { select: { name: true } } } },
        },
        take,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const collectActionFields = (a: any): FieldVal[] => {
      const fields: FieldVal[] = [];
      pushField(fields, 'title', a.title, 3);
      pushField(fields, 'description', a.description, 1);
      pushField(fields, 'contact', a.contact?.name, 1);
      pushField(fields, 'contact company', a.contact?.company?.name || a.contact?.companyName, 1);
      pushField(fields, 'organization', a.company?.name, 1);
      for (const ac of a.actionContacts || []) pushField(fields, 'contact', ac.contact.name, 1);
      for (const ac of a.actionCompanies || []) pushField(fields, 'organization', ac.company.name, 1);
      return fields;
    };

    // ── Ideas ────────────────────────────────────────────────
    const ideaClausesFor = (term: string): Record<string, unknown>[] => [
      { title: { contains: term } },
      { description: { contains: term } },
      { tags: { contains: term } },
    ];

    let ideas: any[] = [];
    if (scopes.has('ideas')) {
      ideas = await prisma.idea.findMany({
        where: { AND: terms.map((t) => ({ OR: ideaClausesFor(t) })) },
        include: {
          contacts: { include: { contact: { select: { id: true, name: true } } } },
          companies: { include: { company: { select: { id: true, name: true } } } },
        },
        take,
        orderBy: { createdAt: 'desc' },
      });
    }

    const collectIdeaFields = (i: any): FieldVal[] => {
      const fields: FieldVal[] = [];
      pushField(fields, 'title', i.title, 3);
      pushField(fields, 'tags', i.tags, 2);
      pushField(fields, 'description', i.description, 1);
      return fields;
    };

    // ── Evaluate, filter, score ──────────────────────────────
    type Evaluated<T> = T & { _s: Scored; _matches: MatchEvidence[] };

    function evaluate<T extends Record<string, any>>(
      records: T[],
      collect: (r: T) => FieldVal[],
      recencyOf: (r: T) => string,
      alphaOf: (r: T) => string
    ): Evaluated<T>[] {
      const out: Evaluated<T>[] = [];
      for (const r of records) {
        const result = evaluateRecord(collect(r), terms, caseSensitive);
        if (!result) continue;
        out.push(Object.assign(r, {
          _s: { score: result.score, recency: recencyOf(r), alpha: alphaOf(r) },
          _matches: result.matches,
        }));
      }
      return out;
    }

    const isoOf = (d: Date | string | null | undefined) =>
      d ? (typeof d === 'string' ? d : d.toISOString()) : '';

    let evContacts = evaluate(contacts, collectContactFields, (c) => isoOf(c.updatedAt), (c) => c.name);
    const evCompanies = evaluate(companies, collectCompanyFields, (c) => isoOf(c.updatedAt), (c) => c.name);
    const evConversations = evaluate(conversations, collectConversationFields, (c) => c.date || '', (c) => c.title || c.contact?.name || c.company?.name || '');
    const evActions = evaluate(actions, collectActionFields, (a) => a.dueDate || isoOf(a.updatedAt).slice(0, 10), (a) => a.title);
    const evIdeas = evaluate(ideas, collectIdeaFields, (i) => isoOf(i.createdAt), (i) => i.title);

    // "Most recently contacted" sort (people only): latest meeting date as
    // anchor contact or named participant. Plain findMany + JS max — no
    // groupBy/_count, per the Turso adapter gotchas.
    if (sort === 'recent-contact' && evContacts.length > 0) {
      const ids = evContacts.map((c) => c.id);
      const [anchored, participated] = await Promise.all([
        prisma.conversation.findMany({
          where: { contactId: { in: ids } },
          select: { contactId: true, date: true },
        }),
        prisma.conversationParticipant.findMany({
          where: { contactId: { in: ids } },
          select: { contactId: true, conversation: { select: { date: true } } },
        }),
      ]);
      const lastContact = new Map<number, string>();
      for (const row of anchored) {
        if (row.contactId === null) continue;
        const prev = lastContact.get(row.contactId) || '';
        if (row.date > prev) lastContact.set(row.contactId, row.date);
      }
      for (const row of participated) {
        const prev = lastContact.get(row.contactId) || '';
        if (row.conversation.date > prev) lastContact.set(row.contactId, row.conversation.date);
      }
      for (const c of evContacts) c._s.recency = lastContact.get(c.id) || '';
      evContacts = sortRecords(evContacts, 'newest');
    } else {
      evContacts = sortRecords(evContacts, sort);
    }
    sortRecords(evCompanies, sort);
    sortRecords(evConversations, sort);
    sortRecords(evActions, sort);
    sortRecords(evIdeas, sort);

    const cap = <T,>(arr: T[]) => arr.slice(0, maxResults);
    const cappedContacts = cap(evContacts);
    const cappedCompanies = cap(evCompanies);
    const cappedConversations = cap(evConversations);
    const cappedActions = cap(evActions);
    const cappedIdeas = cap(evIdeas);

    // ── Totals per group (for "show all N" links) ────────────
    // In case-sensitive mode DB counts are an insensitive superset, so report
    // the verified count instead (bounded by the fetch cap).
    let totals: Record<string, number>;
    if (caseSensitive) {
      totals = {
        contacts: evContacts.length,
        companies: evCompanies.length,
        conversations: evConversations.length,
        actions: evActions.length,
        ideas: evIdeas.length,
      };
    } else {
      const [tContacts, tCompanies, tConversations, tActions, tIdeas] = await Promise.all([
        peopleProfile || peopleNotes
          ? prisma.contact.count({ where: { AND: terms.map((t) => ({ OR: contactClausesFor(t) })) } })
          : 0,
        scopes.has('orgs')
          ? prisma.company.count({ where: { AND: terms.map((t) => ({ OR: companyClausesFor(t) })) } })
          : 0,
        scopes.has('meetings')
          ? prisma.conversation.count({ where: { AND: terms.map((t) => ({ OR: conversationClausesFor(t) })) } })
          : 0,
        scopes.has('actions')
          ? prisma.action.count({ where: { AND: terms.map((t) => ({ OR: actionClausesFor(t) })) } })
          : 0,
        scopes.has('ideas')
          ? prisma.idea.count({ where: { AND: terms.map((t) => ({ OR: ideaClausesFor(t) })) } })
          : 0,
      ]);
      totals = {
        contacts: tContacts, companies: tCompanies, conversations: tConversations,
        actions: tActions, ideas: tIdeas,
      };
    }

    // ── Shape the response ───────────────────────────────────
    const contactResults = await Promise.all(
      cappedContacts.map(async (contact) => {
        const result: any = {
          id: contact.id,
          name: contact.name,
          title: contact.title,
          ecosystem: contact.ecosystem,
          status: contact.status,
          company: contact.company,
          matches: contact._matches,
        };
        if (fetchRelated) {
          result.related = await getContactRelated(contact);
        }
        return result;
      })
    );

    const companyResults = await Promise.all(
      cappedCompanies.map(async (company) => {
        const result: any = {
          id: company.id,
          name: company.name,
          industry: company.industry,
          status: company.status,
          matches: company._matches,
        };
        if (fetchRelated) {
          result.related = await getCompanyRelated(company.id);
        }
        return result;
      })
    );

    const actionResults = cappedActions.map((action) => ({
      id: action.id,
      title: action.title,
      type: action.type,
      completed: action.completed,
      dueDate: action.dueDate,
      contact: action.contact ? { id: action.contact.id, name: action.contact.name } : null,
      company: action.company,
      matches: action._matches,
    }));

    const ideaResults = cappedIdeas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      contacts: (idea.contacts || []).map((ic: any) => ic.contact),
      companies: (idea.companies || []).map((ic: any) => ic.company),
      matches: idea._matches,
    }));

    const conversationResults = cappedConversations.map((conv) => ({
      id: conv.id,
      title: conv.title,
      summary: conv.summary,
      date: conv.date,
      type: conv.type,
      // Display-name fallback mirrors the client: title → contact → company → description
      displayName: conv.title || conv.contact?.name || conv.company?.name || conv.attendeesDescription || 'Meeting',
      contact: conv.contact,
      company: conv.company,
      matches: conv._matches,
    }));

    console.log(
      `[TIMING] search q="${q.trim()}" terms=${terms.length} scopes=${[...scopes].join('+')} ` +
      `cs=${caseSensitive} sort=${sort} → ${Date.now() - tStart}ms ` +
      `(contacts ${contactResults.length}/${totals.contacts}, companies ${companyResults.length}/${totals.companies}, ` +
      `meetings ${conversationResults.length}/${totals.conversations}, actions ${actionResults.length}/${totals.actions}, ` +
      `ideas ${ideaResults.length}/${totals.ideas})`
    );

    res.json({
      query: q.trim(),
      terms,
      scopes: [...scopes],
      sort,
      caseSensitive,
      totals,
      contacts: contactResults,
      companies: companyResults,
      actions: actionResults,
      ideas: ideaResults,
      conversations: conversationResults,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// JSON helpers for Contact's denormalized id/email lists
function parseJsonIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => (typeof item === 'object' && item !== null ? item.id : item))
      .filter((id) => typeof id === 'number');
  } catch {
    return [];
  }
}

function parseJsonStrings(json: string | null | undefined): string {
  if (!json) return '';
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string').join(' ') : '';
  } catch {
    return '';
  }
}

// Helper: Get related entities for a contact
async function getContactRelated(contact: any) {
  const related: any = {
    companies: [],
    contacts: [],
    actions: [],
    ideas: [],
    conversations: [],
  };

  // Primary company
  if (contact.company) {
    related.companies.push({
      id: contact.company.id,
      name: contact.company.name,
      relationship: 'Current company',
    });
  }

  // Additional companies from JSON
  if (contact.additionalCompanyIds) {
    try {
      const additional = JSON.parse(contact.additionalCompanyIds);
      if (Array.isArray(additional)) {
        for (const item of additional) {
          const id = typeof item === 'object' ? item.id : item;
          const isCurrent = typeof item === 'object' ? item.isCurrent !== false : true;
          const company = await prisma.company.findUnique({
            where: { id },
            select: { id: true, name: true },
          });
          if (company && !related.companies.find((c: any) => c.id === company.id)) {
            related.companies.push({
              ...company,
              relationship: isCurrent ? 'Current company' : 'Former company',
            });
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Referrer
  if (contact.referredById) {
    const referrer = await prisma.contact.findUnique({
      where: { id: contact.referredById },
      select: { id: true, name: true },
    });
    if (referrer) {
      related.contacts.push({ ...referrer, relationship: 'Referred by' });
    }
  }

  // Relationships (both directions)
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromContactId: contact.id },
        { toContactId: contact.id },
      ],
    },
    include: {
      fromContact: { select: { id: true, name: true } },
      toContact: { select: { id: true, name: true } },
    },
  });

  for (const rel of relationships) {
    const other = rel.fromContactId === contact.id
      ? rel.toContact
      : rel.fromContact;
    if (!related.contacts.find((c: any) => c.id === other.id)) {
      related.contacts.push({
        id: other.id,
        name: other.name,
        relationship: rel.type.replace(/_/g, ' ').toLowerCase(),
      });
    }
  }

  // Pending actions (limit 5)
  const actions = await prisma.action.findMany({
    where: { contactId: contact.id, completed: false },
    select: { id: true, title: true, completed: true },
    take: 5,
  });
  related.actions = actions;

  // Ideas via junction (limit 5)
  const ideaContacts = await prisma.ideaContact.findMany({
    where: { contactId: contact.id },
    include: { idea: { select: { id: true, title: true } } },
    take: 5,
  });
  related.ideas = ideaContacts.map((ic) => ic.idea);

  // Recent conversations (limit 3)
  const conversations = await prisma.conversation.findMany({
    where: { contactId: contact.id },
    select: { id: true, summary: true, date: true },
    orderBy: { date: 'desc' },
    take: 3,
  });
  related.conversations = conversations;

  return related;
}

// Helper: Get related entities for a company
async function getCompanyRelated(companyId: number) {
  const related: any = {
    contacts: [],
    actions: [],
    ideas: [],
    conversations: [],
  };

  // Contacts at this company (limit 10)
  const contacts = await prisma.contact.findMany({
    where: { companyId },
    select: { id: true, name: true, title: true },
    take: 10,
  });
  related.contacts = contacts;

  // Pending actions (limit 5)
  const actions = await prisma.action.findMany({
    where: { companyId, completed: false },
    select: { id: true, title: true, completed: true },
    take: 5,
  });
  related.actions = actions;

  // Ideas via junction (limit 5)
  const ideaCompanies = await prisma.ideaCompany.findMany({
    where: { companyId },
    include: { idea: { select: { id: true, title: true } } },
    take: 5,
  });
  related.ideas = ideaCompanies.map((ic) => ic.idea);

  // Conversations where this company was discussed (limit 3)
  const conversationCompanies = await prisma.conversationCompany.findMany({
    where: { companyId },
    include: {
      conversation: {
        select: {
          id: true,
          title: true,
          summary: true,
          date: true,
          contact: { select: { name: true } },
        },
      },
    },
    take: 3,
  });
  related.conversations = conversationCompanies.map((cc) => ({
    id: cc.conversation.id,
    summary: cc.conversation.summary,
    date: cc.conversation.date,
    contactName: cc.conversation.contact?.name ?? cc.conversation.title ?? '',
  }));

  return related;
}

export default router;
