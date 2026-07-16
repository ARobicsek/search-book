// Third artifact of the manual backup (alongside the JSON snapshot and the
// binaries ZIP): a single markdown document optimized for an LLM search /
// synthesis agent pointed at your notes ("find every organizational dysfunction
// I've documented in meetings", etc.).
//
// The JSON backup is a faithful DB dump — great for restore, poor for an agent:
// note fields are single escaped lines (`\n` instead of real breaks), attendees
// are bare integer IDs, and ~40% of the bytes are junction rows, timestamps, and
// scaffolding the agent has to wade through. This transform inverts that: every
// ID is resolved to a name, notes render as true multi-line markdown, and each
// record is self-contained so a single grep hit carries its full context.
//
// Pure function of the in-memory backup `data` object — no server round-trip,
// same source the JSON download and photo ZIP already use.

type Row = Record<string, unknown>;

function rows(data: Record<string, unknown>, table: string): Row[] {
  const v = data[table];
  return Array.isArray(v) ? (v as Row[]) : [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Contact display name: preferred name wins, then full name, then a stable fallback. */
function contactLabel(c: Row | undefined): string {
  if (!c) return 'Unknown contact';
  return str(c.preferredName) || str(c.name) || `Contact ${c.id}`;
}

/** Parse the additionalCompanyIds JSON blob ([{id, isCurrent}]) defensively. */
function parseAdditionalCompanies(raw: unknown): { id: number; isCurrent?: boolean }[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'number') : [];
  } catch {
    return [];
  }
}

/** Meeting date label, honoring datePrecision (month/quarter/year meetings are coarse). */
function meetingDate(conv: Row): string {
  const date = str(conv.date);
  const precision = str(conv.datePrecision) || 'DAY';
  const time = str(conv.startTime);
  if (precision === 'DAY') return time ? `${date} ${time}` : date;
  if (precision === 'MONTH') return `${date.slice(0, 7)} (month)`;
  if (precision === 'YEAR') return `${date.slice(0, 4)} (year)`;
  return `${date} (${precision.toLowerCase()})`;
}

/**
 * Strip note markup that is noise to an agent: @-mention link syntax collapses to
 * a bare `@Name` (the image bytes / target IDs live elsewhere), and pasted-image
 * embeds collapse to a short `[image]` placeholder instead of a long blob URL.
 * Real reference links ([text](http…)) are left intact.
 */
function cleanText(text: string): string {
  return text
    // Image embeds: ![alt](url) -> "[image: alt]" or "[image]"
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) =>
      alt.trim() && alt.trim().toLowerCase() !== 'screenshot' ? `[image: ${alt.trim()}]` : '[image]')
    // @-mentions: [@Name](/contacts/7) or [@Name](#org-mention) -> "@Name"
    .replace(/\[@([^\]]+)\]\((?:\/(?:contacts|companies)\/\d+|#[a-z-]+)\)/g, '@$1');
}

/** Render a value as a labeled block so multi-line notes stay readable. */
function block(label: string, value: unknown): string {
  const text = str(value);
  if (!text) return '';
  return `\n**${label}:**\n\n${cleanText(text)}\n`;
}

/**
 * Build the LLM-facing markdown export from a backup `data` object.
 * Returns the full document as a string.
 */
export function buildLlmExport(data: Record<string, unknown>): string {
  const contacts = rows(data, 'Contact');
  const companies = rows(data, 'Company');
  const conversations = rows(data, 'Conversation');
  const tags = rows(data, 'Tag');
  const series = rows(data, 'Series');

  // ---- Lookup maps (id -> entity) ----
  const contactById = new Map<number, Row>(contacts.map((c) => [c.id as number, c]));
  const companyById = new Map<number, Row>(companies.map((c) => [c.id as number, c]));
  const tagNameById = new Map<number, string>(tags.map((t) => [t.id as number, str(t.name)]));
  const seriesNameById = new Map<number, string>(series.map((s) => [s.id as number, str(s.name)]));

  const cName = (id: unknown) =>
    typeof id === 'number' ? contactLabel(contactById.get(id)) : '';
  const coName = (id: unknown) =>
    typeof id === 'number' ? str(companyById.get(id)?.name) || `Company ${id}` : '';

  // ---- Group junction rows by conversation ----
  const participantsByConv = new Map<number, Row[]>();
  for (const p of rows(data, 'ConversationParticipant')) {
    const cid = p.conversationId as number;
    (participantsByConv.get(cid) ?? participantsByConv.set(cid, []).get(cid)!).push(p);
  }
  const discussedContactsByConv = new Map<number, number[]>();
  for (const r of rows(data, 'ConversationContact')) {
    const cid = r.conversationId as number;
    (discussedContactsByConv.get(cid) ?? discussedContactsByConv.set(cid, []).get(cid)!).push(
      r.contactId as number,
    );
  }
  const discussedCompaniesByConv = new Map<number, number[]>();
  for (const r of rows(data, 'ConversationCompany')) {
    const cid = r.conversationId as number;
    (discussedCompaniesByConv.get(cid) ?? discussedCompaniesByConv.set(cid, []).get(cid)!).push(
      r.companyId as number,
    );
  }
  const orgsByConv = new Map<number, number[]>();
  for (const r of rows(data, 'ConversationOrg')) {
    const cid = r.conversationId as number;
    (orgsByConv.get(cid) ?? orgsByConv.set(cid, []).get(cid)!).push(r.companyId as number);
  }
  const tagsByConv = new Map<number, number[]>();
  for (const r of rows(data, 'ConversationTag')) {
    const cid = r.conversationId as number;
    (tagsByConv.get(cid) ?? tagsByConv.set(cid, []).get(cid)!).push(r.tagId as number);
  }
  const prepNotesByConv = new Map<number, Row[]>();
  for (const r of rows(data, 'ConversationPrepNote')) {
    const cid = r.conversationId as number;
    (prepNotesByConv.get(cid) ?? prepNotesByConv.set(cid, []).get(cid)!).push(r);
  }
  const actionsByConv = new Map<number, Row[]>();
  const actionsByContact = new Map<number, Row[]>();
  for (const a of rows(data, 'Action')) {
    if (typeof a.conversationId === 'number') {
      const cid = a.conversationId;
      (actionsByConv.get(cid) ?? actionsByConv.set(cid, []).get(cid)!).push(a);
    }
    if (typeof a.contactId === 'number') {
      const cid = a.contactId;
      (actionsByContact.get(cid) ?? actionsByContact.set(cid, []).get(cid)!).push(a);
    }
  }
  const employmentByContact = new Map<number, Row[]>();
  for (const e of rows(data, 'EmploymentHistory')) {
    const cid = e.contactId as number;
    (employmentByContact.get(cid) ?? employmentByContact.set(cid, []).get(cid)!).push(e);
  }
  const relationshipsByContact = new Map<number, Row[]>();
  for (const r of rows(data, 'Relationship')) {
    for (const cid of [r.fromContactId, r.toContactId]) {
      if (typeof cid === 'number')
        (relationshipsByContact.get(cid) ?? relationshipsByContact.set(cid, []).get(cid)!).push(r);
    }
  }

  const names = (ids: number[] | undefined, fn: (id: number) => string) =>
    (ids ?? []).map(fn).filter(Boolean).join(', ');

  const out: string[] = [];

  // ---- Document header (orients the agent) ----
  out.push('# SearchBook export for search / synthesis');
  out.push('');
  out.push(
    'Personal CRM export optimized for an LLM agent. Three sections: **Meetings** ' +
      '(newest first — the primary record of what was said and decided), **People**, and ' +
      '**Organizations**. Every person and org is named (no IDs). Meeting notes are the ' +
      'source of truth for what happened; per-attendee lines capture individual takeaways.',
  );
  out.push('');
  out.push(`Generated ${new Date().toISOString()} · ${conversations.length} meetings · ${contacts.length} people · ${companies.length} organizations.`);
  out.push('');

  // ---- Meetings (newest first) ----
  out.push('---');
  out.push('');
  out.push('## Meetings');
  out.push('');

  const sortedConvs = [...conversations].sort((a, b) => {
    const da = `${str(a.date)} ${str(a.startTime)}`;
    const db = `${str(b.date)} ${str(b.startTime)}`;
    return db.localeCompare(da); // newest first
  });

  for (const conv of sortedConvs) {
    const id = conv.id as number;
    const parts = (participantsByConv.get(id) ?? []).sort(
      (a, b) => (Number(a.ordering) || 0) - (Number(b.ordering) || 0),
    );
    const title =
      str(conv.title) ||
      (parts.length ? cName(parts[0].contactId) : '') ||
      str(conv.attendeesDescription) ||
      'Untitled meeting';

    out.push(`### ${meetingDate(conv)} — ${title}`);
    out.push('');

    const meta: string[] = [];
    const type = str(conv.type);
    if (type && type !== 'OTHER') meta.push(`Type: ${type}`);
    if (typeof conv.seriesId === 'number' && seriesNameById.get(conv.seriesId))
      meta.push(`Series: ${seriesNameById.get(conv.seriesId)}`);
    const withOrgs = names(orgsByConv.get(id), coName);
    if (withOrgs) meta.push(`With: ${withOrgs}`);
    else if (typeof conv.companyId === 'number') meta.push(`Org: ${coName(conv.companyId)}`);
    const tagNames = names(tagsByConv.get(id), (t) => tagNameById.get(t) || '');
    if (tagNames) meta.push(`Tags: ${tagNames}`);
    if (meta.length) {
      out.push(meta.join(' · '));
      out.push('');
    }

    // Attendees, with per-person takeaway notes.
    if (parts.length) {
      out.push('**Attendees:**');
      out.push('');
      for (const p of parts) {
        const note = str(p.note);
        out.push(`- ${cName(p.contactId)}${note ? ` — ${cleanText(note)}` : ''}`);
      }
      out.push('');
    } else if (str(conv.attendeesDescription)) {
      out.push(`**Attendees:** ${str(conv.attendeesDescription)}`);
      out.push('');
    }

    const discussedPeople = names(discussedContactsByConv.get(id), cName);
    if (discussedPeople) out.push(`**People discussed:** ${discussedPeople}\n`);
    const discussedOrgs = names(discussedCompaniesByConv.get(id), coName);
    if (discussedOrgs) out.push(`**Orgs discussed:** ${discussedOrgs}\n`);

    const summary = block('Summary', conv.summary);
    if (summary) out.push(summary);
    const notes = block('Notes', conv.notes);
    if (notes) out.push(notes);
    const nextSteps = block('Next steps', conv.nextSteps);
    if (nextSteps) out.push(nextSteps);

    const preps = prepNotesByConv.get(id) ?? [];
    for (const pn of preps) {
      const b = block('Prep note', pn.content);
      if (b) out.push(b);
    }

    const acts = actionsByConv.get(id) ?? [];
    if (acts.length) {
      out.push('**Actions:**');
      out.push('');
      for (const a of acts) {
        const done = a.completed ? '[done] ' : '';
        const due = str(a.dueDate) ? ` (due ${str(a.dueDate)})` : '';
        const desc = str(a.description) ? ` — ${str(a.description)}` : '';
        out.push(`- ${done}${str(a.title)}${due}${desc}`);
      }
      out.push('');
    }

    out.push('');
  }

  // ---- People ----
  out.push('---');
  out.push('');
  out.push('## People');
  out.push('');

  const sortedContacts = [...contacts].sort((a, b) =>
    contactLabel(a).localeCompare(contactLabel(b)),
  );

  for (const c of sortedContacts) {
    const id = c.id as number;
    out.push(`### ${contactLabel(c)}`);
    out.push('');

    const line: string[] = [];
    if (str(c.title)) line.push(str(c.title));
    const primaryCo = typeof c.companyId === 'number' ? coName(c.companyId) : str(c.companyName);
    if (primaryCo) line.push(primaryCo);
    if (line.length) {
      out.push(`*${line.join(' · ')}*`);
      out.push('');
    }

    const facts: string[] = [];
    if (str(c.ecosystem)) facts.push(`Ecosystem: ${str(c.ecosystem)}`);
    if (str(c.status)) facts.push(`Status: ${str(c.status)}`);
    if (str(c.location)) facts.push(`Location: ${str(c.location)}`);
    if (str(c.howConnected)) facts.push(`How connected: ${str(c.howConnected)}`);
    if (typeof c.referredById === 'number') facts.push(`Referred by: ${cName(c.referredById)}`);
    const extraCos = parseAdditionalCompanies(c.additionalCompanyIds)
      .map((x) => coName(x.id))
      .filter(Boolean);
    if (extraCos.length) facts.push(`Also affiliated: ${extraCos.join(', ')}`);
    if (facts.length) {
      out.push(facts.join(' · '));
      out.push('');
    }

    const notes = block('Notes', c.notes);
    if (notes) out.push(notes);
    const personal = block('Personal details', c.personalDetails);
    if (personal) out.push(personal);
    const useful = block('Useful for', c.usefulFor);
    if (useful) out.push(useful);
    const questions = block('Open questions', c.openQuestions);
    if (questions) out.push(questions);

    const emp = (employmentByContact.get(id) ?? []).filter(
      (e) => str(e.companyName) || typeof e.companyId === 'number',
    );
    if (emp.length) {
      out.push('**Career history:**');
      out.push('');
      for (const e of emp) {
        const co = str(e.companyName) || coName(e.companyId);
        const role = str(e.title);
        const span = [str(e.startDate), str(e.endDate) || (str(e.startDate) ? 'present' : '')]
          .filter(Boolean)
          .join('–');
        out.push(`- ${[role, co].filter(Boolean).join(', ')}${span ? ` (${span})` : ''}`);
      }
      out.push('');
    }

    const rels = relationshipsByContact.get(id) ?? [];
    if (rels.length) {
      out.push('**Relationships:**');
      out.push('');
      for (const r of rels) {
        const other = r.fromContactId === id ? r.toContactId : r.fromContactId;
        const note = str(r.notes) ? ` — ${str(r.notes)}` : '';
        out.push(`- ${str(r.type) || 'related'}: ${cName(other)}${note}`);
      }
      out.push('');
    }

    const openActs = (actionsByContact.get(id) ?? []).filter((a) => !a.completed);
    if (openActs.length) {
      out.push('**Open actions:**');
      out.push('');
      for (const a of openActs) {
        const due = str(a.dueDate) ? ` (due ${str(a.dueDate)})` : '';
        out.push(`- ${str(a.title)}${due}`);
      }
      out.push('');
    }

    out.push('');
  }

  // ---- Organizations (only those with real content) ----
  const richCompanies = companies
    .filter((c) => str(c.notes) || str(c.industry) || str(c.website) || str(c.hqLocation))
    .sort((a, b) => str(a.name).localeCompare(str(b.name)));

  if (richCompanies.length) {
    out.push('---');
    out.push('');
    out.push('## Organizations');
    out.push('');
    for (const c of richCompanies) {
      out.push(`### ${str(c.name) || `Company ${c.id}`}`);
      out.push('');
      const facts: string[] = [];
      if (str(c.industry)) facts.push(`Industry: ${str(c.industry)}`);
      if (str(c.size)) facts.push(`Size: ${str(c.size)}`);
      if (str(c.hqLocation)) facts.push(`HQ: ${str(c.hqLocation)}`);
      if (str(c.status)) facts.push(`Status: ${str(c.status)}`);
      if (str(c.website)) facts.push(`Web: ${str(c.website)}`);
      if (facts.length) {
        out.push(facts.join(' · '));
        out.push('');
      }
      const notes = block('Notes', c.notes);
      if (notes) out.push(notes);
      out.push('');
    }
  }

  return out.join('\n');
}
