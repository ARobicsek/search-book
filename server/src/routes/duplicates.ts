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

        // Name similarity
        const nameSim = similarity(c1.name, c2.name);
        if (nameSim > 0.8) {
          reasons.push(`Similar names (${Math.round(nameSim * 100)}%)`);
        }

        // Exact email match
        if (c1.email && c2.email && c1.email.toLowerCase() === c2.email.toLowerCase()) {
          reasons.push('Same email');
        }

        // LinkedIn match
        if (c1.linkedinUrl && c2.linkedinUrl && c1.linkedinUrl === c2.linkedinUrl) {
          reasons.push('Same LinkedIn');
        }

        if (reasons.length > 0) {
          duplicates.push({
            contact1: c1,
            contact2: c2,
            score: nameSim,
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

// POST /api/duplicates/merge — merge two contacts
router.post('/merge', async (req: Request, res: Response) => {
  try {
    const { keepId, removeId } = req.body;
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

    await prisma.$transaction(async (tx) => {
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
