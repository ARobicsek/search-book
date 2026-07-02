import { Router, Request, Response } from 'express';
import prisma from '../db';
import { resyncConversationMentions } from '../lib/mentions';

const router = Router();

// Levenshtein distance with early exit when distance exceeds maxDist
function levenshtein(a: string, b: string, maxDist?: number): number {
  if (a.length < b.length) { const t = a; a = b; b = t; }
  const m = a.length, n = b.length;
  if (maxDist !== undefined && (m - n) > maxDist) return maxDist + 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (maxDist !== undefined && rowMin > maxDist) return maxDist + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Compute similarity only if it could exceed minSim (avoids wasted Levenshtein)
function similarity(a: string, b: string, minSim: number = 0): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const maxDist = Math.floor((1 - minSim) * longer.length);
  if (longer.length - shorter.length > maxDist) return 0;
  const dist = levenshtein(longer.toLowerCase(), shorter.toLowerCase(), maxDist);
  if (dist > maxDist) return 0;
  return (longer.length - dist) / longer.length;
}

// Normalize name: strip middle initials, suffixes, and extra whitespace
function normalizeName(name: string): string {
  let n = name.trim();
  // Remove parenthesized suffixes like "(J.D.)" or "(PhD)"
  n = n.replace(/\s*\([^)]*\)\s*$/, '');
  // Remove common suffixes (with or without preceding comma/dash)
  // Loop to handle chained suffixes like "Jr., J.D."
  const suffixPattern = /[,\s\-]+(J\.?D\.?|M\.?D\.?|Ph\.?D\.?|D\.?O\.?|MBA|MPA|MPH|CPA|CFP|CFA|LCSW|RN|Jr\.?|Sr\.?|III|II|IV|V|Esq\.?)\s*$/gi;
  for (let i = 0; i < 3; i++) {
    const before = n;
    n = n.replace(suffixPattern, '');
    if (n === before) break;
  }
  // Remove middle initials (single letter optionally followed by a period, between spaces)
  n = n.replace(/\s+[A-Za-z]\.?\s+/g, ' ');
  // Collapse whitespace and trim
  return n.replace(/\s+/g, ' ').trim();
}

// Extract lowercase name tokens for set-based comparison
function nameTokens(name: string): string[] {
  return normalizeName(name).toLowerCase().split(/\s+/).filter(Boolean);
}

// Check if two token sets represent the same person (one is subset of the other)
function tokensMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  // One is a subset of the other (handles "Katie Tucker" vs "Katie Marie Tucker")
  const aSubsetB = a.every(t => setB.has(t));
  const bSubsetA = b.every(t => setA.has(t));
  return aSubsetB || bSubsetA;
}

// Normalized key for contact dismissal / merge-rule lookup
function contactNameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

// Return [a, b] sorted so a <= b — canonical form for pair storage
function orderedPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

// GET /api/duplicates — find potential duplicate contacts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const t0 = Date.now();
    // Minimal query: only fields needed for name/email comparison + display
    const contacts = await prisma.contact.findMany({
      select: {
        id: true, name: true, email: true, title: true,
        company: { select: { id: true, name: true } },
      },
    });
    console.log(`[duplicates] DB query: ${Date.now() - t0}ms, ${contacts.length} contacts`);

    type SlimContact = typeof contacts[0];
    const duplicates: Array<{
      contact1: SlimContact;
      contact2: SlimContact;
      score: number;
      reasons: string[];
    }> = [];

    // Pre-compute normalized names and tokens
    const normalized = contacts.map(c => normalizeName(c.name));
    const allTokens = contacts.map(c => nameTokens(c.name));

    // Build candidate pairs from name tokens + email index
    const candidates = new Set<string>();

    // Name token index
    const tokenIndex = new Map<string, number[]>();
    for (let i = 0; i < contacts.length; i++) {
      for (const token of allTokens[i]) {
        let arr = tokenIndex.get(token);
        if (!arr) { arr = []; tokenIndex.set(token, arr); }
        arr.push(i);
      }
    }
    for (const indices of tokenIndex.values()) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          candidates.add(`${Math.min(indices[a], indices[b])},${Math.max(indices[a], indices[b])}`);
        }
      }
    }

    // Email index
    const emailIndex = new Map<string, number[]>();
    for (let i = 0; i < contacts.length; i++) {
      if (contacts[i].email) {
        const key = contacts[i].email!.toLowerCase();
        let arr = emailIndex.get(key);
        if (!arr) { arr = []; emailIndex.set(key, arr); }
        arr.push(i);
      }
    }
    for (const indices of emailIndex.values()) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          candidates.add(`${Math.min(indices[a], indices[b])},${Math.max(indices[a], indices[b])}`);
        }
      }
    }

    console.log(`[duplicates] Indexing: ${Date.now() - t0}ms, ${candidates.size} candidates`);

    // Evaluate candidate pairs
    for (const key of candidates) {
      const [i, j] = key.split(',').map(Number);
      const c1 = contacts[i];
      const c2 = contacts[j];
      const reasons: string[] = [];

      // Name similarity
      const rawSim = similarity(c1.name, c2.name, 0.8);
      const normSim = similarity(normalized[i], normalized[j], 0.8);
      const nameSim = Math.max(rawSim, normSim);
      if (nameSim > 0.8) {
        reasons.push(`Similar names (${Math.round(nameSim * 100)}%)`);
      }

      // Token-based match
      const tokens1 = allTokens[i];
      const tokens2 = allTokens[j];
      if (!reasons.length && tokensMatch(tokens1, tokens2) && tokens1.length >= 2 && tokens2.length >= 2) {
        reasons.push('Same name (normalized)');
      }

      // Exact email match
      if (c1.email && c2.email && c1.email.toLowerCase() === c2.email.toLowerCase()) {
        reasons.push('Same email');
      }

      const effectiveScore = tokensMatch(tokens1, tokens2) ? Math.max(nameSim, 0.95) : nameSim;

      if (reasons.length > 0) {
        duplicates.push({ contact1: c1, contact2: c2, score: effectiveScore, reasons });
      }
    }

    duplicates.sort((a, b) => b.score - a.score);
    console.log(`[duplicates] Total: ${Date.now() - t0}ms, ${candidates.size} candidates, ${duplicates.length} duplicates`);

    // Load server-side dismissals and merge rules
    const [dismissals, mergeRules] = await Promise.all([
      prisma.dismissedDuplicate.findMany({ where: { type: 'contact' } }),
      prisma.duplicateMergeRule.findMany({ where: { type: 'contact' } }),
    ]);

    const dismissedSet = new Set(dismissals.map(d => `${d.nameKey1}|${d.nameKey2}`));
    // removedKey → keptKey
    const mergeRuleMap = new Map(mergeRules.map(r => [r.removedKey, r.keptKey]));

    // Partition into auto-mergeable, dismissed, and pairs needing review
    const reviewPairs: typeof duplicates = [];
    const toAutoMerge: Array<{ keepId: number; removeId: number }> = [];

    for (const dup of duplicates) {
      const key1 = contactNameKey(dup.contact1.name);
      const key2 = contactNameKey(dup.contact2.name);
      const [k1, k2] = orderedPair(key1, key2);
      const pairKey = `${k1}|${k2}`;

      // Merge rules outrank dismissals: an explicit "combine these" is a stronger
      // signal than "ignore this pair", so check rules FIRST. (If the user once
      // dismissed a pair and later merged it, the merge wins.)
      const keptFor1 = mergeRuleMap.get(key1);
      const keptFor2 = mergeRuleMap.get(key2);

      if (key1 === key2 && mergeRuleMap.has(key1)) {
        // Both names reduce to the identical normalized key (e.g. "John Smith" vs
        // "John Smith Jr." — differ only by a suffix normalizeName strips) — the
        // single-key removedKey/keptKey pair can't tell us which literal name was
        // which anymore, but a rule on this key means it's a confirmed dup group.
        // Keep the lower id (the more established record) and fold the other in.
        const [keepId, removeId] = dup.contact1.id < dup.contact2.id
          ? [dup.contact1.id, dup.contact2.id]
          : [dup.contact2.id, dup.contact1.id];
        toAutoMerge.push({ keepId, removeId });
      } else if (keptFor1 === key2) {
        // contact1.name was previously deleted; contact2.name is the survivor
        toAutoMerge.push({ keepId: dup.contact2.id, removeId: dup.contact1.id });
      } else if (keptFor2 === key1) {
        // contact2.name was previously deleted; contact1.name is the survivor
        toAutoMerge.push({ keepId: dup.contact1.id, removeId: dup.contact2.id });
      } else if (dismissedSet.has(pairKey)) {
        continue; // explicitly dismissed — silently suppress
      } else {
        reviewPairs.push(dup);
      }
    }

    // Auto-merge applicable pairs (reimported entities with prior merge rules)
    let autoMergedCount = 0;
    for (const { keepId, removeId } of toAutoMerge) {
      try {
        const [keep, remove] = await Promise.all([
          prisma.contact.findUnique({ where: { id: keepId } }),
          prisma.contact.findUnique({ where: { id: removeId } }),
        ]);
        if (!keep || !remove) continue;
        await runContactMerge(keepId, removeId, keep, remove);
        autoMergedCount++;
        console.log(`[duplicates] Auto-merged contact ${removeId} into ${keepId} (merge rule match)`);
      } catch (err) {
        console.error('[duplicates] Auto-merge failed for contact pair', keepId, removeId, err);
        // Fall back: show the pair for manual review
        const dup = toAutoMerge.length > 0
          ? duplicates.find(d => (d.contact1.id === keepId && d.contact2.id === removeId) || (d.contact1.id === removeId && d.contact2.id === keepId))
          : undefined;
        if (dup) reviewPairs.push(dup);
      }
    }

    res.json({ pairs: reviewPairs, autoMergedCount });
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

// POST /api/duplicates/dismiss — persist a dismissed contact pair by normalized name
router.post('/dismiss', async (req: Request, res: Response) => {
  try {
    const { name1, name2 } = req.body as { name1: string; name2: string };
    if (!name1 || !name2) {
      res.status(400).json({ error: 'name1 and name2 are required' });
      return;
    }
    const [k1, k2] = orderedPair(contactNameKey(name1), contactNameKey(name2));
    await prisma.dismissedDuplicate.upsert({
      where: { type_nameKey1_nameKey2: { type: 'contact', nameKey1: k1, nameKey2: k2 } },
      update: {},
      create: { type: 'contact', nameKey1: k1, nameKey2: k2 },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error dismissing contact pair:', error);
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

// Field selection type for merge
type FieldSelection = 1 | 2 | 'both';
interface FieldSelections {
  name?: FieldSelection;
  email?: FieldSelection;
  phone?: FieldSelection;
  title?: FieldSelection;
  linkedinUrl?: FieldSelection;
  ecosystem?: FieldSelection;
  status?: FieldSelection;
  location?: FieldSelection;
  howConnected?: FieldSelection;
  personalDetails?: FieldSelection;
  roleDescription?: FieldSelection;
  notes?: FieldSelection;
  photoFile?: FieldSelection;
  photoUrl?: FieldSelection;
  mutualConnections?: FieldSelection;
  whereFound?: FieldSelection;
  openQuestions?: FieldSelection;
  flagged?: FieldSelection;
}

// Union two "Useful For" notes so a merge never drops a useful person, whichever
// side had it. Keeps the kept contact's text first and appends the removed
// contact's only when it adds something new (non-empty and not identical).
// usefulFor is intentionally NOT a user-selectable merge field — carry-over is
// automatic so the owner can't accidentally discard a "useful" flag.
function unionUsefulFor(keepVal: string | null, removeVal: string | null): string | null {
  const keepText = (keepVal ?? '').trim();
  const removeText = (removeVal ?? '').trim();
  if (!removeText) return keepVal ?? null;            // nothing to carry over
  if (!keepText) return removeText;                   // only the removed side had it
  if (keepText === removeText) return keepVal ?? null; // identical — no change
  return `${keepText}\n\n${removeText}`;              // both differ → keep both
}

// Shared contact merge logic — called by both the POST /merge endpoint and the auto-merge
// path in GET /. No field selections = keep all of the "keep" contact's fields as-is.
async function runContactMerge(
  keepId: number,
  removeId: number,
  keep: { usefulFor: string | null; [key: string]: unknown },
  remove: { usefulFor: string | null; [key: string]: unknown },
  fieldSelections?: FieldSelections,
) {
  const contact1 = keepId < removeId ? keep : remove;
  const contact2 = keepId < removeId ? remove : keep;

  await prisma.$transaction(async (tx) => {
    if (fieldSelections) {
      const updateData: Record<string, unknown> = {};

      const selectableFields = [
        'name', 'email', 'phone', 'title', 'linkedinUrl', 'ecosystem',
        'status', 'location', 'howConnected', 'personalDetails',
        'roleDescription', 'notes', 'photoFile', 'photoUrl',
        'mutualConnections', 'whereFound', 'openQuestions', 'flagged'
      ] as const;

      for (const field of selectableFields) {
        const selection = fieldSelections[field];
        if (!selection) continue;

        if (field === 'email' && selection === 'both') {
          const getAllEmails = (contact: typeof contact1): string[] => {
            const emails: string[] = [];
            const c = contact as Record<string, unknown>;
            if (c.email) emails.push(c.email as string);
            if (c.additionalEmails) {
              try {
                const additional = JSON.parse(c.additionalEmails as string) as string[];
                emails.push(...additional);
              } catch { /* ignore */ }
            }
            return emails;
          };
          const allEmails = [...new Set([...getAllEmails(contact1), ...getAllEmails(contact2)])];
          if (allEmails.length > 0) {
            updateData.email = allEmails[0];
            updateData.additionalEmails = allEmails.length > 1 ? JSON.stringify(allEmails.slice(1)) : null;
          }
        } else if (field === 'phone' && selection === 'both') {
          const c1 = contact1 as Record<string, unknown>;
          const c2 = contact2 as Record<string, unknown>;
          const phones = [c1.phone, c2.phone].filter(Boolean) as string[];
          const unique = [...new Set(phones)];
          updateData.phone = unique.join(' | ') || null;
        } else if (selection === 1 || selection === 2) {
          const sourceContact = (selection === 1 ? contact1 : contact2) as Record<string, unknown>;
          updateData[field] = sourceContact[field];
        }
      }

      if (Object.keys(updateData).length > 0) {
        await tx.contact.update({ where: { id: keepId }, data: updateData });
      }
    }

    const mergedUsefulFor = unionUsefulFor(keep.usefulFor, remove.usefulFor);
    if (mergedUsefulFor !== (keep.usefulFor ?? null)) {
      await tx.contact.update({ where: { id: keepId }, data: { usefulFor: mergedUsefulFor } });
    }

    // Move conversations (anchor contact). Raw SQL on purpose: a merge is a
    // re-link, not a content edit, so it must NOT bump Conversation.updatedAt
    // (Prisma's @updatedAt would, sending old meetings to the top of the
    // "Recently updated" sort — exactly the surprise the owner reported).
    await tx.$executeRaw`UPDATE "Conversation" SET "contactId" = ${keepId} WHERE "contactId" = ${removeId}`;

    await tx.action.updateMany({ where: { contactId: removeId }, data: { contactId: keepId } });
    await tx.relationship.updateMany({ where: { fromContactId: removeId }, data: { fromContactId: keepId } });
    await tx.relationship.updateMany({ where: { toContactId: removeId }, data: { toContactId: keepId } });
    await tx.link.updateMany({ where: { contactId: removeId }, data: { contactId: keepId } });
    await tx.prepNote.updateMany({ where: { contactId: removeId }, data: { contactId: keepId } });
    await tx.employmentHistory.updateMany({ where: { contactId: removeId }, data: { contactId: keepId } });

    // Meeting participants (attendees). Composite PK [conversationId, contactId],
    // so re-point only where the kept contact isn't already a participant; carry
    // the per-person takeaway note onto the kept row when it has none.
    const removeParticipants = await tx.conversationParticipant.findMany({ where: { contactId: removeId } });
    const keepParticipants = await tx.conversationParticipant.findMany({
      where: { contactId: keepId },
      select: { conversationId: true, note: true },
    });
    const keepPartNote = new Map(keepParticipants.map((p) => [p.conversationId, p.note]));
    for (const rp of removeParticipants) {
      if (keepPartNote.has(rp.conversationId)) {
        if (!keepPartNote.get(rp.conversationId) && rp.note) {
          await tx.conversationParticipant.update({
            where: { conversationId_contactId: { conversationId: rp.conversationId, contactId: keepId } },
            data: { note: rp.note },
          });
        }
      } else {
        await tx.conversationParticipant.create({
          data: { conversationId: rp.conversationId, contactId: keepId, note: rp.note, ordering: rp.ordering },
        });
      }
    }
    await tx.conversationParticipant.deleteMany({ where: { contactId: removeId } });

    const removeActionContacts = await tx.actionContact.findMany({ where: { contactId: removeId } });
    const keepActionContacts = await tx.actionContact.findMany({ where: { contactId: keepId }, select: { actionId: true } });
    const keepActionIds = new Set(keepActionContacts.map((x) => x.actionId));
    for (const rec of removeActionContacts) {
      if (!keepActionIds.has(rec.actionId)) {
        await tx.actionContact.create({ data: { actionId: rec.actionId, contactId: keepId } });
      }
    }
    await tx.actionContact.deleteMany({ where: { contactId: removeId } });

    const oldMentionToken = `(/contacts/${removeId})`;
    const newMentionToken = `(/contacts/${keepId})`;
    const [noteConvs, prepConvs, mentionConvs] = await Promise.all([
      tx.conversation.findMany({
        where: { OR: [{ notes: { contains: oldMentionToken } }, { nextSteps: { contains: oldMentionToken } }] },
        select: { id: true },
      }),
      tx.conversationPrepNote.findMany({ where: { content: { contains: oldMentionToken } }, select: { conversationId: true } }),
      tx.conversationMention.findMany({ where: { contactId: removeId }, select: { conversationId: true } }),
    ]);
    const affectedConvIds = new Set<number>([
      ...noteConvs.map((c) => c.id),
      ...prepConvs.map((p) => p.conversationId),
      ...mentionConvs.map((m) => m.conversationId),
    ]);
    if (affectedConvIds.size > 0) {
      const like = `%${oldMentionToken}%`;
      await tx.$executeRaw`UPDATE "Conversation" SET "notes" = REPLACE("notes", ${oldMentionToken}, ${newMentionToken}) WHERE "notes" LIKE ${like}`;
      await tx.$executeRaw`UPDATE "Conversation" SET "nextSteps" = REPLACE("nextSteps", ${oldMentionToken}, ${newMentionToken}) WHERE "nextSteps" LIKE ${like}`;
      await tx.$executeRaw`UPDATE "ConversationPrepNote" SET "content" = REPLACE("content", ${oldMentionToken}, ${newMentionToken}) WHERE "content" LIKE ${like}`;
      for (const convId of affectedConvIds) {
        await resyncConversationMentions(tx, convId);
      }
    }

    await tx.conversationContact.deleteMany({ where: { contactId: removeId } });
    await tx.contactTag.deleteMany({ where: { contactId: removeId } });
    await tx.ideaContact.deleteMany({ where: { contactId: removeId } });
    await tx.contact.delete({ where: { id: removeId } });
  });
}

// POST /api/duplicates/merge — merge two contacts with field selection
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { keepId, removeId, fieldSelections } = req.body as {
      keepId: number;
      removeId: number;
      fieldSelections?: FieldSelections;
    };
    if (!keepId || !removeId || keepId === removeId) {
      res.status(400).json({ error: 'keepId and removeId are required and must be different' });
      return;
    }

    const [keep, remove] = await Promise.all([
      prisma.contact.findUnique({ where: { id: keepId } }),
      prisma.contact.findUnique({ where: { id: removeId } }),
    ]);

    if (!keep || !remove) {
      res.status(404).json({ error: 'One or both contacts not found' });
      return;
    }

    await runContactMerge(keepId, removeId, keep, remove, fieldSelections);

    // Record merge rule so future reimports of the removed contact auto-merge.
    // Re-fetch the kept contact's name: a field selection may have chosen the
    // removed contact's name for the survivor, so the pre-merge `keep.name` we
    // fetched above could now be stale.
    const keptNow = await prisma.contact.findUnique({ where: { id: keepId }, select: { name: true } });
    const removedKey = contactNameKey(remove.name);
    const keptKey = contactNameKey(keptNow?.name ?? keep.name);
    // Always record the rule, even when both names collapse to the same
    // normalized key (e.g. exact-name duplicates, or "Jr."/middle-initial-only
    // differences) — that's the highest-confidence duplicate bucket, and a future
    // reimport of either spelling still needs to auto-merge instead of asking again.
    await prisma.duplicateMergeRule.upsert({
      where: { type_removedKey: { type: 'contact', removedKey } },
      update: { keptKey },
      create: { type: 'contact', removedKey, keptKey },
    });
    // The user's intent for this pair just changed from "ignore" (if it had ever
    // been dismissed) to "always combine". Drop any stale dismissal so it can't
    // short-circuit the merge rule on the next scan.
    const [k1, k2] = orderedPair(removedKey, keptKey);
    await prisma.dismissedDuplicate.deleteMany({
      where: { type: 'contact', nameKey1: k1, nameKey2: k2 },
    });

    res.json({ message: 'Contacts merged successfully' });
  } catch (error) {
    console.error('Error merging contacts:', error);
    res.status(500).json({ error: 'Failed to merge contacts' });
  }
});

// Punctuation/symbol normalization shared by the "core" form and the token-subset
// form: lowercase, &->and, hyphen/slash->space, drop apostrophes/diacritics/periods/
// zero-width chars, collapse whitespace. Catches "&" vs "and" (#2) and hyphen vs
// space (#4 Dana-Farber) and apostrophes (#3 Children's).
function normalizeCompanyPunctuation(name: string): string {
  let n = name.replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
  n = n.normalize('NFD').replace(/[\u0300-\u036F]/g, ''); // strip diacritics
  n = n.replace(/&/g, ' and ');
  n = n.replace(/['\u2018\u2019]/g, '');                  // drop apostrophes
  n = n.replace(/\./g, '');                               // "Inc." -> "inc", "L.P." -> "lp"
  n = n.replace(/[-/,]/g, ' ');                           // hyphen / slash / comma -> space
  return n.replace(/\s+/g, ' ').trim();
}

// Trailing descriptor/legal tokens that rarely change which entity is meant.
// Deliberately EXCLUDES "health" so "Baylor ... Health" vs "Baylor ... Research
// Institute" stays a *low-confidence* shared-prefix match (#6) rather than collapsing
// to a false high-confidence exact match.
const COMPANY_DESCRIPTOR_SUFFIXES = new Set([
  'inc', 'llc', 'lp', 'llp', 'pllc', 'corp', 'corporation', 'ltd', 'limited',
  'co', 'company', 'institute', 'research', 'services', 'service', 'system',
  'systems', 'center', 'centers', 'centre', 'centres', 'hospital', 'hospitals',
  'group', 'foundation',
]);

// Common connector words ignored when judging whether a shared *prefix* is meaningful.
const COMPANY_STOPWORDS = new Set(['and', 'for', 'of', 'the', 'a', 'an', 'at', 'in', 'on', 'to']);

// "Core" form for comparing the essential name: punctuation-normalized, "healthcare"
// folded to "health" (#5 Intermountain), then trailing descriptor/legal tokens
// stripped so the core compares (#1 Arcadia, #2 CMS "Services", #4 institute).
export function normalizeCompanyNameForDedupe(name: string): string {
  const n = normalizeCompanyPunctuation(name).replace(/\bhealthcare\b/g, 'health');
  const tokens = n.split(' ').filter(Boolean);
  // Strip trailing descriptors but never down to nothing (keep >= 1 token).
  while (tokens.length > 1 && COMPANY_DESCRIPTOR_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

// Company name key for dismissal / merge-rule lookup (same as core dedupe form)
function companyNameKey(name: string): string {
  return normalizeCompanyNameForDedupe(name);
}

// Token list with punctuation normalization but NO descriptor stripping — used for the
// subset test so "Boston Children's Hospital" tokens are a subset of "...Hospital CHIP"
// (#3) while "Mass General Hospital" vs "Mass General Brigham" (divergent tails) is NOT.
function companyTokensForSubset(name: string): string[] {
  return normalizeCompanyPunctuation(name)
    .replace(/\bhealthcare\b/g, 'health')
    .split(' ')
    .filter(Boolean);
}

// Length of the shared leading-token run (a true prefix from index 0).
function sharedPrefixLen(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// GET /api/duplicates/companies — find potential duplicate companies
router.get('/companies', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true, name: true, industry: true, size: true, status: true,
      },
    });

    type SlimCompany = typeof companies[0];
    const duplicates: Array<{
      company1: SlimCompany;
      company2: SlimCompany;
      score: number;
      reasons: string[];
    }> = [];

    const normalized = companies.map(c => normalizeCompanyNameForDedupe(c.name));
    const subsetTokens = companies.map(c => companyTokensForSubset(c.name));

    for (let i = 0; i < companies.length; i++) {
      for (let j = i + 1; j < companies.length; j++) {
        const c1 = companies[i];
        const c2 = companies[j];
        const reasons: string[] = [];
        let score = 0;
        const a = normalized[i];
        const b = normalized[j];

        if (a && b && a === b) {
          // Cores match after punctuation + descriptor normalization (#1,#2,#4,#5).
          reasons.push('Same core name (normalized)');
          score = 1.0;
        } else {
          const sim = similarity(a, b, 0.85);
          if (sim > 0.85) {
            reasons.push(`Similar names (${Math.round(sim * 100)}%)`);
            score = sim;
          } else if (tokensMatch(subsetTokens[i], subsetTokens[j])) {
            // One full name's tokens are contained in the other (#3 "...Hospital CHIP").
            // Safe: divergent tails (Mass General Hospital vs Brigham) are NOT subsets.
            reasons.push('One name contains the other');
            score = 0.9;
          } else {
            // Low-confidence bucket (D1): a long shared *prefix* with divergent tails —
            // e.g. "Baylor Scott & White Health" vs "...Research Institute" (#6).
            // Require >= 3 non-stopword shared-prefix tokens so distinct same-parent
            // entities (UCSF vs UC Berkeley = 2, Mass General H. vs Brigham = 2) stay out.
            const ti = subsetTokens[i];
            const tj = subsetTokens[j];
            const shared = sharedPrefixLen(ti, tj);
            const meaningful = ti.slice(0, shared).filter(t => !COMPANY_STOPWORDS.has(t)).length;
            if (meaningful >= 3 && shared < ti.length && shared < tj.length) {
              reasons.push(`Shared name prefix (${shared} words) — low confidence, review`);
              score = 0.5;
            }
          }
        }

        if (reasons.length > 0) {
          duplicates.push({ company1: c1, company2: c2, score, reasons });
        }
      }
    }

    duplicates.sort((a, b) => b.score - a.score);

    // Load server-side dismissals and merge rules
    const [dismissals, mergeRules] = await Promise.all([
      prisma.dismissedDuplicate.findMany({ where: { type: 'company' } }),
      prisma.duplicateMergeRule.findMany({ where: { type: 'company' } }),
    ]);

    const dismissedSet = new Set(dismissals.map(d => `${d.nameKey1}|${d.nameKey2}`));
    const mergeRuleMap = new Map(mergeRules.map(r => [r.removedKey, r.keptKey]));

    const reviewPairs: typeof duplicates = [];
    const toAutoMerge: Array<{ keepId: number; removeId: number }> = [];

    for (const dup of duplicates) {
      const key1 = companyNameKey(dup.company1.name);
      const key2 = companyNameKey(dup.company2.name);
      const [k1, k2] = orderedPair(key1, key2);
      const pairKey = `${k1}|${k2}`;

      // Merge rules outrank dismissals (see contact scan for rationale).
      const keptFor1 = mergeRuleMap.get(key1);
      const keptFor2 = mergeRuleMap.get(key2);

      if (key1 === key2 && mergeRuleMap.has(key1)) {
        // Same core name on both sides (e.g. "Acme Health System" vs "Acme Health
        // System Inc" — both strip to "acme health") — see contact scan for why the
        // single-key rule can't distinguish direction here. Keep the lower id.
        const [keepId, removeId] = dup.company1.id < dup.company2.id
          ? [dup.company1.id, dup.company2.id]
          : [dup.company2.id, dup.company1.id];
        toAutoMerge.push({ keepId, removeId });
      } else if (keptFor1 === key2) {
        toAutoMerge.push({ keepId: dup.company2.id, removeId: dup.company1.id });
      } else if (keptFor2 === key1) {
        toAutoMerge.push({ keepId: dup.company1.id, removeId: dup.company2.id });
      } else if (dismissedSet.has(pairKey)) {
        continue; // explicitly dismissed — silently suppress
      } else {
        reviewPairs.push(dup);
      }
    }

    let autoMergedCount = 0;
    for (const { keepId, removeId } of toAutoMerge) {
      try {
        const [keep, remove] = await Promise.all([
          prisma.company.findUnique({ where: { id: keepId } }),
          prisma.company.findUnique({ where: { id: removeId } }),
        ]);
        if (!keep || !remove) continue;
        await runCompanyMerge(keepId, removeId, keep, remove);
        autoMergedCount++;
        console.log(`[duplicates] Auto-merged company ${removeId} into ${keepId} (merge rule match)`);
      } catch (err) {
        console.error('[duplicates] Auto-merge failed for company pair', keepId, removeId, err);
        const dup = duplicates.find(d =>
          (d.company1.id === keepId && d.company2.id === removeId) ||
          (d.company1.id === removeId && d.company2.id === keepId)
        );
        if (dup) reviewPairs.push(dup);
      }
    }

    res.json({ pairs: reviewPairs, autoMergedCount });
  } catch (error) {
    console.error('Error finding company duplicates:', error);
    res.status(500).json({ error: 'Failed to find company duplicates' });
  }
});

// POST /api/duplicates/companies/dismiss — persist a dismissed company pair by normalized name
router.post('/companies/dismiss', async (req: Request, res: Response) => {
  try {
    const { name1, name2 } = req.body as { name1: string; name2: string };
    if (!name1 || !name2) {
      res.status(400).json({ error: 'name1 and name2 are required' });
      return;
    }
    const [k1, k2] = orderedPair(companyNameKey(name1), companyNameKey(name2));
    await prisma.dismissedDuplicate.upsert({
      where: { type_nameKey1_nameKey2: { type: 'company', nameKey1: k1, nameKey2: k2 } },
      update: {},
      create: { type: 'company', nameKey1: k1, nameKey2: k2 },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error dismissing company pair:', error);
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

interface CompanyFieldSelections {
  name?: FieldSelection;
  industry?: FieldSelection;
  size?: FieldSelection;
  website?: FieldSelection;
  hqLocation?: FieldSelection;
  status?: FieldSelection;
  notes?: FieldSelection;
}

// Shared company merge logic
async function runCompanyMerge(
  keepId: number,
  removeId: number,
  keep: Record<string, unknown>,
  remove: Record<string, unknown>,
  fieldSelections?: CompanyFieldSelections,
) {
  const company1 = keepId < removeId ? keep : remove;
  const company2 = keepId < removeId ? remove : keep;

  await prisma.$transaction(async (tx) => {
    if (fieldSelections) {
      const updateData: Record<string, unknown> = {};
      const selectableFields = ['name', 'industry', 'size', 'website', 'hqLocation', 'status', 'notes'] as const;

      for (const field of selectableFields) {
        const selection = fieldSelections[field];
        if (!selection) continue;

        if (field === 'notes' && selection === 'both') {
          const notes = [company1.notes, company2.notes].filter(Boolean);
          updateData.notes = notes.join('\n\n---\n\n') || null;
        } else if (selection === 1 || selection === 2) {
          const sourceCompany = selection === 1 ? company1 : company2;
          updateData[field] = sourceCompany[field];
        }
      }

      if (Object.keys(updateData).length > 0) {
        await tx.company.update({ where: { id: keepId }, data: updateData });
      }
    }

    await tx.contact.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });

    const contactsWithJson = await tx.contact.findMany({
      where: {
        OR: [
          { additionalCompanyIds: { contains: `${removeId}` } },
          { connectedCompanyIds: { contains: `${removeId}` } }
        ]
      }
    });

    for (const c of contactsWithJson) {
      let updated = false;
      const data: Record<string, unknown> = {};

      if (c.additionalCompanyIds) {
        try {
          const parsed = JSON.parse(c.additionalCompanyIds);
          if (Array.isArray(parsed)) {
            let changed = false;
            const newArr = parsed.map((item: unknown) => {
              if (typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === removeId) {
                changed = true;
                return { ...(item as object), id: keepId };
              } else if (item === removeId) {
                changed = true;
                return keepId;
              }
              return item;
            });
            if (changed) {
              const dedupedObjIds = new Set();
              const finalArr = [];
              for (const item of newArr) {
                const cid = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).id : item;
                if (!dedupedObjIds.has(cid)) {
                  dedupedObjIds.add(cid);
                  finalArr.push(item);
                }
              }
              data.additionalCompanyIds = JSON.stringify(finalArr);
              updated = true;
            }
          }
        } catch { /* ignore */ }
      }

      if (c.connectedCompanyIds) {
        try {
          const parsed = JSON.parse(c.connectedCompanyIds);
          if (Array.isArray(parsed)) {
            const idx = parsed.indexOf(removeId);
            if (idx !== -1) {
              parsed[idx] = keepId;
              data.connectedCompanyIds = JSON.stringify([...new Set(parsed)]);
              updated = true;
            }
          }
        } catch { /* ignore */ }
      }

      if (updated) {
        await tx.contact.update({ where: { id: c.id }, data });
      }
    }

    const removeActionCos = await tx.actionCompany.findMany({ where: { companyId: removeId } });
    const keepActionCos = await tx.actionCompany.findMany({ where: { companyId: keepId } });
    const keepActionIds = new Set(keepActionCos.map(x => x.actionId));
    for (const rec of removeActionCos) {
      if (!keepActionIds.has(rec.actionId)) {
        await tx.actionCompany.create({ data: { actionId: rec.actionId, companyId: keepId } });
      }
    }
    await tx.actionCompany.deleteMany({ where: { companyId: removeId } });

    const removeConvCos = await tx.conversationCompany.findMany({ where: { companyId: removeId } });
    const keepConvCos = await tx.conversationCompany.findMany({ where: { companyId: keepId } });
    const keepConvIds = new Set(keepConvCos.map(x => x.conversationId));
    for (const rec of removeConvCos) {
      if (!keepConvIds.has(rec.conversationId)) {
        await tx.conversationCompany.create({ data: { conversationId: rec.conversationId, companyId: keepId } });
      }
    }
    await tx.conversationCompany.deleteMany({ where: { companyId: removeId } });

    const removeIdeaCos = await tx.ideaCompany.findMany({ where: { companyId: removeId } });
    const keepIdeaCos = await tx.ideaCompany.findMany({ where: { companyId: keepId } });
    const keepIdeaIds = new Set(keepIdeaCos.map(x => x.ideaId));
    for (const rec of removeIdeaCos) {
      if (!keepIdeaIds.has(rec.ideaId)) {
        await tx.ideaCompany.create({ data: { ideaId: rec.ideaId, companyId: keepId } });
      }
    }
    await tx.ideaCompany.deleteMany({ where: { companyId: removeId } });

    const removeTagCos = await tx.companyTag.findMany({ where: { companyId: removeId } });
    const keepTagCos = await tx.companyTag.findMany({ where: { companyId: keepId } });
    const keepTagIds = new Set(keepTagCos.map(x => x.tagId));
    for (const rec of removeTagCos) {
      if (!keepTagIds.has(rec.tagId)) {
        await tx.companyTag.create({ data: { tagId: rec.tagId, companyId: keepId } });
      }
    }
    await tx.companyTag.deleteMany({ where: { companyId: removeId } });

    await tx.employmentHistory.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
    await tx.companyActivity.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
    await tx.companyPrepNote.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
    await tx.companyStatusHistory.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
    await tx.link.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });

    await tx.company.delete({ where: { id: removeId } });
  });
}

// POST /api/duplicates/companies/merge — merge two companies with field selection
router.post('/companies/merge', async (req: Request, res: Response) => {
  try {
    const { keepId, removeId, fieldSelections } = req.body as {
      keepId: number;
      removeId: number;
      fieldSelections?: CompanyFieldSelections;
    };
    if (!keepId || !removeId || keepId === removeId) {
      res.status(400).json({ error: 'keepId and removeId are required and must be different' });
      return;
    }

    const [keep, remove] = await Promise.all([
      prisma.company.findUnique({ where: { id: keepId } }),
      prisma.company.findUnique({ where: { id: removeId } }),
    ]);

    if (!keep || !remove) {
      res.status(404).json({ error: 'One or both companies not found' });
      return;
    }

    await runCompanyMerge(keepId, removeId, keep as Record<string, unknown>, remove as Record<string, unknown>, fieldSelections);

    // Record merge rule so future reimports of the removed company auto-merge.
    // Re-fetch the kept company's name: a field selection may have chosen the
    // removed company's name for the survivor, so the pre-merge `keep.name` we
    // fetched above could now be stale.
    const keptNow = await prisma.company.findUnique({ where: { id: keepId }, select: { name: true } });
    const removedKey = companyNameKey(remove.name);
    const keptKey = companyNameKey(keptNow?.name ?? keep.name);
    // Always record the rule — see the contact merge endpoint for why this must
    // not be skipped when removedKey === keptKey (e.g. "Acme Health System" vs
    // "Acme Health System Inc" both core-normalize to "acme health"). That's
    // actually the MOST common real-world company-duplicate shape (a legal-entity
    // suffix added/dropped between data entries), so skipping it there defeated
    // the auto-merge feature for its primary use case.
    await prisma.duplicateMergeRule.upsert({
      where: { type_removedKey: { type: 'company', removedKey } },
      update: { keptKey },
      create: { type: 'company', removedKey, keptKey },
    });
    // Drop any stale dismissal so it can't short-circuit the merge rule next scan.
    const [k1, k2] = orderedPair(removedKey, keptKey);
    await prisma.dismissedDuplicate.deleteMany({
      where: { type: 'company', nameKey1: k1, nameKey2: k2 },
    });

    res.json({ message: 'Companies merged successfully' });
  } catch (error) {
    console.error('Error merging companies:', error);
    res.status(500).json({ error: 'Failed to merge companies' });
  }
});

export default router;
