import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/companies — list all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id — single company with linked contacts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.id as string);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Find contacts linked to this company
    // Either primary companyId, or in additionalCompanyIds, or in connectedCompanyIds
    const allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { companyId: companyId },
          { additionalCompanyIds: { contains: `"${companyId}"` } }, // Simple substring match works for JSON arrays of objects/strings in SQLite
          { additionalCompanyIds: { contains: `${companyId}` } },   // legacy format fallback
          { connectedCompanyIds: { contains: `${companyId}` } },    // Simple substring match for array of numbers
        ]
      },
      select: {
        id: true,
        name: true,
        title: true,
        ecosystem: true,
        status: true,
        companyId: true,
        additionalCompanyIds: true,
        connectedCompanyIds: true,
      }
    });

    // We can confidently split these into Employed vs Connected
    const employedContacts: typeof allContacts = [];
    const connectedContacts: typeof allContacts = [];

    for (const c of allContacts) {
      let isEmployed = false;
      let isConnected = false;

      if (c.companyId === companyId) {
        isEmployed = true;
      } else if (c.additionalCompanyIds) {
        try {
          const parsed = JSON.parse(c.additionalCompanyIds);
          if (Array.isArray(parsed) && parsed.some(item =>
            (typeof item === 'object' && item.id === companyId) ||
            (item === companyId)
          )) {
            isEmployed = true;
          }
        } catch { /* ignore parse error */ }
      }

      if (c.connectedCompanyIds) {
        try {
          const parsed = JSON.parse(c.connectedCompanyIds);
          if (Array.isArray(parsed) && parsed.includes(companyId)) {
            isConnected = true;
          }
        } catch { /* ignore parse error */ }
      }

      if (isEmployed) employedContacts.push(c);
      if (isConnected) connectedContacts.push(c);
    }

    res.json({
      ...company,
      contacts: employedContacts,
      employedContacts,
      connectedContacts,
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const company = await prisma.company.create({
      data: { name: name.trim(), ...rest },
    });

    // Record initial status in history
    await prisma.companyStatusHistory.create({
      data: {
        companyId: company.id,
        oldStatus: null,
        newStatus: company.status,
      }
    });

    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// POST /api/companies/:id/contacts — Add a contact to a company
router.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.id as string);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const { contactId, contactName, type } = req.body;
    if (!type || !['EMPLOYED', 'CONNECTED'].includes(type)) {
      res.status(400).json({ error: 'Valid type (EMPLOYED or CONNECTED) is required' });
      return;
    }

    let targetContactId = contactId;

    // If a new name is provided instead of an ID, create the contact first
    if (!targetContactId && contactName) {
      if (typeof contactName !== 'string' || contactName.trim().length === 0) {
        res.status(400).json({ error: 'Valid contactName is required when contactId is not provided' });
        return;
      }
      const newContact = await prisma.contact.create({
        data: {
          name: contactName.trim(),
          status: 'CONNECTED',
          ecosystem: 'ROLODEX'
        }
      });
      targetContactId = newContact.id;
    } else if (!targetContactId) {
      res.status(400).json({ error: 'Either contactId or contactName is required' });
      return;
    }

    // Fetch the existing contact
    const contact = await prisma.contact.findUnique({ where: { id: parseInt(targetContactId) } });
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Prepare update data based on relationship type
    const updateData: any = {};

    if (type === 'EMPLOYED') {
      // Logic for adding to employment
      if (!contact.companyId) {
        // If entirely empty, set as primary
        updateData.companyId = companyId;
      } else {
        // Otherwise append to additionalCompanyIds securely
        const currentAdditional = contact.additionalCompanyIds
          ? JSON.parse(contact.additionalCompanyIds)
          : [];

        // Ensure we don't duplicate
        const isAlreadyEmployed = contact.companyId === companyId ||
          (Array.isArray(currentAdditional) && currentAdditional.some((c: any) =>
            (typeof c === 'object' && c.id === companyId) || c === companyId
          ));

        if (!isAlreadyEmployed) {
          currentAdditional.push({ id: companyId, isCurrent: true });
          updateData.additionalCompanyIds = JSON.stringify(currentAdditional);
        }
      }
    } else if (type === 'CONNECTED') {
      // Logic for adding to connected array
      const currentConnected = contact.connectedCompanyIds
        ? JSON.parse(contact.connectedCompanyIds)
        : [];

      if (Array.isArray(currentConnected) && !currentConnected.includes(companyId)) {
        currentConnected.push(companyId);
        updateData.connectedCompanyIds = JSON.stringify(currentConnected);
      } else if (!Array.isArray(currentConnected)) {
        updateData.connectedCompanyIds = JSON.stringify([companyId]);
      }
    }

    // Apply the update if we mutated anything
    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: updateData
      });
    }

    res.status(200).json({ success: true, contactId: contact.id });
  } catch (error) {
    console.error('Error linking contact to company:', error);
    res.status(500).json({ error: 'Failed to link contact to company' });
  }
});

// PUT /api/companies/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      req.body.name = req.body.name.trim();
    }
    const company = await prisma.company.update({
      where: { id },
      data: req.body,
    });

    // Record status change if it changed
    if (req.body.status && req.body.status !== existing.status) {
      await prisma.companyStatusHistory.create({
        data: {
          companyId: company.id,
          oldStatus: existing.status,
          newStatus: company.status,
        }
      });
    }

    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    await prisma.company.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
