import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// Levenshtein distance for name similarity
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshtein(longer.toLowerCase(), shorter.toLowerCase())) / longer.length;
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
    const contacts = await prisma.contact.findMany({
      include: { company: { select: { id: true, name: true } } },
    });

    const duplicates: Array<{
      contact1: typeof contacts[0];
      contact2: typeof contacts[0];
      score: number;
      reasons: string[];
    }> = [];

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const c1 = contacts[i];
        const c2 = contacts[j];
        const reasons: string[] = [];

        // Name similarity — compare both raw and normalized names, take higher score
        const rawSim = similarity(c1.name, c2.name);
        const normSim = similarity(normalizeName(c1.name), normalizeName(c2.name));
        const nameSim = Math.max(rawSim, normSim);
        if (nameSim > 0.8) {
          reasons.push(`Similar names (${Math.round(nameSim * 100)}%)`);
        }

        // Token-based match — catches "Katie M. Tucker" vs "Katie Tucker" even if Levenshtein misses
        const tokens1 = nameTokens(c1.name);
        const tokens2 = nameTokens(c2.name);
        if (!reasons.length && tokensMatch(tokens1, tokens2) && tokens1.length >= 2 && tokens2.length >= 2) {
          reasons.push('Same name (normalized)');
        }

        // Same company + moderate name similarity
        const sameCompany = (c1.companyId && c2.companyId && c1.companyId === c2.companyId) ||
          (c1.companyName && c2.companyName && c1.companyName.toLowerCase() === c2.companyName.toLowerCase());
        if (sameCompany && nameSim > 0.6 && !reasons.length) {
          reasons.push(`Similar names + same company (${Math.round(nameSim * 100)}%)`);
        }

        // Exact email match
        if (c1.email && c2.email && c1.email.toLowerCase() === c2.email.toLowerCase()) {
          reasons.push('Same email');
        }

        // LinkedIn match
        if (c1.linkedinUrl && c2.linkedinUrl && c1.linkedinUrl === c2.linkedinUrl) {
          reasons.push('Same LinkedIn');
        }

        // Use token match or normSim as score when Levenshtein was low
        const effectiveScore = tokensMatch(tokens1, tokens2) ? Math.max(nameSim, 0.95) : nameSim;

        if (reasons.length > 0) {
          duplicates.push({
            contact1: c1,
            contact2: c2,
            score: effectiveScore,
            reasons,
          });
        }
      }
    }

    duplicates.sort((a, b) => b.score - a.score);
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
      // Move conversations
      await tx.conversation.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });

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

export default router;
