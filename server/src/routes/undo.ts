import { Router, Request, Response } from 'express';
import { peekLatest, restoreLatest } from '../lib/undo';

const router = Router();

// GET /api/undo — what (if anything) the most recent delete left undoable. Drives the
// persistent header "Undo" affordance; survives reload because it's DB-backed.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const snap = await peekLatest();
    if (!snap) {
      res.json({ canUndo: false });
      return;
    }
    res.json({ canUndo: true, entityType: snap.entityType, entityId: snap.entityId, label: snap.label });
  } catch (error) {
    console.error('Error peeking undo snapshot:', error);
    res.status(500).json({ error: 'Failed to read undo state' });
  }
});

// POST /api/undo — replay + consume the most recent snapshot.
router.post('/', async (_req: Request, res: Response) => {
  try {
    const result = await restoreLatest();
    if (!result) {
      res.status(404).json({ error: 'Nothing to undo' });
      return;
    }
    res.json(result);
  } catch (error: any) {
    // An id reused since the delete collides on re-insert; the transaction rolled back.
    if (error?.code === 'P2002') {
      res.status(409).json({ error: "Couldn't undo — that record's ID was already reused." });
      return;
    }
    console.error('Error restoring undo snapshot:', error);
    res.status(500).json({ error: 'Failed to undo' });
  }
});

export default router;
