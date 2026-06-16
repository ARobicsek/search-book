import { Router, Request, Response } from 'express';
import prisma from '../db';

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
    res.json(duplicates);
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
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

    // Determine which contact is "1" and which is "2" based on IDs
    // Contact 1 = lower ID, Contact 2 = higher ID (consistent with frontend)
    const contact1 = keepId < removeId ? keep : remove;
    const contact2 = keepId < removeId ? remove : keep;

    await prisma.$transaction(async (tx) => {
      // If fieldSelections provided, update the kept contact with selected field values
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

          // Special handling for email with 'both' option
          if (field === 'email' && selection === 'both') {
            // Combine all emails from both contacts
            const getAllEmails = (contact: typeof contact1): string[] => {
              const emails: string[] = [];
              if (contact.email) emails.push(contact.email);
              if (contact.additionalEmails) {
                try {
                  const additional = JSON.parse(contact.additionalEmails) as string[];
                  emails.push(...additional);
                } catch {
                  // ignore parse errors
                }
              }
              return emails;
            };

            const allEmails = [...new Set([...getAllEmails(contact1), ...getAllEmails(contact2)])];
            if (allEmails.length > 0) {
              updateData.email = allEmails[0];
              updateData.additionalEmails = allEmails.length > 1 ? JSON.stringify(allEmails.slice(1)) : null;
            }
          } else if (field === 'phone' && selection === 'both') {
            // Combine phone numbers with separator
            const phones = [contact1.phone, contact2.phone].filter(Boolean);
            const unique = [...new Set(phones)];
            updateData.phone = unique.join(' | ') || null;
          } else if (selection === 1 || selection === 2) {
            // Get value from selected contact (1 or 2)
            const sourceContact = selection === 1 ? contact1 : contact2;
            updateData[field] = sourceContact[field];
          }
        }

        if (Object.keys(updateData).length > 0) {
          await tx.contact.update({
            where: { id: keepId },
            data: updateData,
          });
        }
      }

      // "Useful For" carries over regardless of the field selections: if the
      // removed contact has useful notes the kept one lacks (or different ones),
      // union them onto the kept contact so a useful person survives the merge.
      const mergedUsefulFor = unionUsefulFor(keep.usefulFor, remove.usefulFor);
      if (mergedUsefulFor !== (keep.usefulFor ?? null)) {
        await tx.contact.update({ where: { id: keepId }, data: { usefulFor: mergedUsefulFor } });
      }

      // Move conversations (anchor contact). Raw SQL on purpose: a merge is a
      // re-link, not a content edit, so it must NOT bump Conversation.updatedAt
      // (Prisma's @updatedAt would, sending old meetings to the top of the
      // "Recently updated" sort — exactly the surprise the owner reported).
      await tx.$executeRaw`UPDATE "Conversation" SET "contactId" = ${keepId} WHERE "contactId" = ${removeId}`;

      // Move actions
      await tx.action.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });

      // Move relationships (from)
      await tx.relationship.updateMany({
        where: { fromContactId: removeId },
        data: { fromContactId: keepId },
      });

      // Move relationships (to)
      await tx.relationship.updateMany({
        where: { toContactId: removeId },
        data: { toContactId: keepId },
      });

      // Move links
      await tx.link.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });

      // Move prep notes
      await tx.prepNote.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });

      // Move employment history
      await tx.employmentHistory.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });

      // Delete junction records that would cause conflicts
      // ConversationContact
      await tx.conversationContact.deleteMany({
        where: { contactId: removeId },
      });

      // ContactTag
      await tx.contactTag.deleteMany({
        where: { contactId: removeId },
      });

      // IdeaContact
      await tx.ideaContact.deleteMany({
        where: { contactId: removeId },
      });

      // Delete the duplicate contact
      await tx.contact.delete({ where: { id: removeId } });
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

// Token list with punctuation normalization but NO descriptor stripping \u2014 used for the
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
    res.json(duplicates);
  } catch (error) {
    console.error('Error finding company duplicates:', error);
    res.status(500).json({ error: 'Failed to find company duplicates' });
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

    const company1 = keepId < removeId ? keep : remove;
    const company2 = keepId < removeId ? remove : keep;

    await prisma.$transaction(async (tx) => {
      // 1. Update Core Fields
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
          await tx.company.update({
            where: { id: keepId },
            data: updateData,
          });
        }
      }

      // 2. Relational Migrations
      
      // Contact.companyId
      await tx.contact.updateMany({
        where: { companyId: removeId },
        data: { companyId: keepId },
      });

      // Contact JSON Arrays (additionalCompanyIds, connectedCompanyIds)
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
        const data: any = {};
        
        if (c.additionalCompanyIds) {
          try {
            const parsed = JSON.parse(c.additionalCompanyIds);
            if (Array.isArray(parsed)) {
              let changed = false;
              const newArr = parsed.map(item => {
                if (typeof item === 'object' && item.id === removeId) {
                  changed = true;
                  return { ...item, id: keepId };
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
                   const cid = typeof item === 'object' ? item.id : item;
                   if (!dedupedObjIds.has(cid)) {
                     dedupedObjIds.add(cid);
                     finalArr.push(item);
                   }
                }
                data.additionalCompanyIds = JSON.stringify(finalArr);
                updated = true;
              }
            }
          } catch {}
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
          } catch {}
        }
        
        if (updated) {
          await tx.contact.update({ where: { id: c.id }, data });
        }
      }

      // ActionCompany
      const removeActionCos = await tx.actionCompany.findMany({ where: { companyId: removeId }});
      const keepActionCos = await tx.actionCompany.findMany({ where: { companyId: keepId }});
      const keepActionIds = new Set(keepActionCos.map(x => x.actionId));
      for (const rec of removeActionCos) {
        if (!keepActionIds.has(rec.actionId)) {
          await tx.actionCompany.create({ data: { actionId: rec.actionId, companyId: keepId } });
        }
      }
      await tx.actionCompany.deleteMany({ where: { companyId: removeId } });

      // ConversationCompany
      const removeConvCos = await tx.conversationCompany.findMany({ where: { companyId: removeId }});
      const keepConvCos = await tx.conversationCompany.findMany({ where: { companyId: keepId }});
      const keepConvIds = new Set(keepConvCos.map(x => x.conversationId));
      for (const rec of removeConvCos) {
        if (!keepConvIds.has(rec.conversationId)) {
          await tx.conversationCompany.create({ data: { conversationId: rec.conversationId, companyId: keepId } });
        }
      }
      await tx.conversationCompany.deleteMany({ where: { companyId: removeId } });
      
      // IdeaCompany
      const removeIdeaCos = await tx.ideaCompany.findMany({ where: { companyId: removeId }});
      const keepIdeaCos = await tx.ideaCompany.findMany({ where: { companyId: keepId }});
      const keepIdeaIds = new Set(keepIdeaCos.map(x => x.ideaId));
      for (const rec of removeIdeaCos) {
        if (!keepIdeaIds.has(rec.ideaId)) {
          await tx.ideaCompany.create({ data: { ideaId: rec.ideaId, companyId: keepId } });
        }
      }
      await tx.ideaCompany.deleteMany({ where: { companyId: removeId } });

      // CompanyTag
      const removeTagCos = await tx.companyTag.findMany({ where: { companyId: removeId }});
      const keepTagCos = await tx.companyTag.findMany({ where: { companyId: keepId }});
      const keepTagIds = new Set(keepTagCos.map(x => x.tagId));
      for (const rec of removeTagCos) {
        if (!keepTagIds.has(rec.tagId)) {
          await tx.companyTag.create({ data: { tagId: rec.tagId, companyId: keepId } });
        }
      }
      await tx.companyTag.deleteMany({ where: { companyId: removeId } });

      // Flat relational tables safely bulk updated
      await tx.employmentHistory.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
      await tx.companyActivity.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
      await tx.companyPrepNote.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
      await tx.companyStatusHistory.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });
      await tx.link.updateMany({ where: { companyId: removeId }, data: { companyId: keepId } });

      // Finally, delete the duplicate company
      await tx.company.delete({ where: { id: removeId } });
    });

    res.json({ message: 'Companies merged successfully' });
  } catch (error) {
    console.error('Error merging companies:', error);
    res.status(500).json({ error: 'Failed to merge companies' });
  }
});

export default router;
