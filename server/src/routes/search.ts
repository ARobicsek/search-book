import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/search?q=term&limit=20&includeRelated=true
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, limit = '10', includeRelated = 'true' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const searchTerm = q.trim().toLowerCase();
    const maxResults = Math.min(parseInt(limit as string) || 10, 50);
    const fetchRelated = includeRelated === 'true';

    // Search contacts
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { title: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { notes: { contains: searchTerm } },
          { roleDescription: { contains: searchTerm } },
          { location: { contains: searchTerm } },
          { mutualConnections: { contains: searchTerm } },
        ],
      },
      include: {
        company: { select: { id: true, name: true } },
      },
      take: maxResults,
      orderBy: { updatedAt: 'desc' },
    });

    // Search companies
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } },
          { industry: { contains: searchTerm } },
          { hqLocation: { contains: searchTerm } },
          { notes: { contains: searchTerm } },
        ],
      },
      include: {
        _count: { select: { contacts: true } },
      },
      take: maxResults,
      orderBy: { updatedAt: 'desc' },
    });

    // Search actions
    const actions = await prisma.action.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm } },
          { description: { contains: searchTerm } },
          { contact: { name: { contains: searchTerm } } },
          { actionContacts: { some: { contact: { name: { contains: searchTerm } } } } },
          { company: { name: { contains: searchTerm } } },
          { actionCompanies: { some: { company: { name: { contains: searchTerm } } } } },
          { contact: { company: { name: { contains: searchTerm } } } },
          { contact: { companyName: { contains: searchTerm } } },
          { actionContacts: { some: { contact: { company: { name: { contains: searchTerm } } } } } },
          { actionContacts: { some: { contact: { companyName: { contains: searchTerm } } } } },
        ],
      },
      include: {
        contact: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
      take: maxResults,
      orderBy: { updatedAt: 'desc' },
    });

    // Search ideas
    const ideas = await prisma.idea.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm } },
          { description: { contains: searchTerm } },
          { tags: { contains: searchTerm } },
        ],
      },
      include: {
        contacts: { include: { contact: { select: { id: true, name: true } } } },
        companies: { include: { company: { select: { id: true, name: true } } } },
      },
      take: maxResults,
      orderBy: { createdAt: 'desc' },
    });

    // Build response with optional related entities
    const contactResults = await Promise.all(
      contacts.map(async (contact) => {
        const result: any = {
          id: contact.id,
          name: contact.name,
          title: contact.title,
          ecosystem: contact.ecosystem,
          status: contact.status,
          company: contact.company,
        };

        if (fetchRelated) {
          result.related = await getContactRelated(contact);
        }

        return result;
      })
    );

    const companyResults = await Promise.all(
      companies.map(async (company) => {
        const result: any = {
          id: company.id,
          name: company.name,
          industry: company.industry,
          status: company.status,
          _count: company._count,
        };

        if (fetchRelated) {
          result.related = await getCompanyRelated(company.id);
        }

        return result;
      })
    );

    const actionResults = actions.map((action) => ({
      id: action.id,
      title: action.title,
      type: action.type,
      completed: action.completed,
      dueDate: action.dueDate,
      contact: action.contact,
      company: action.company,
    }));

    const ideaResults = ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      contacts: idea.contacts.map((ic) => ic.contact),
      companies: idea.companies.map((ic) => ic.company),
    }));

    res.json({
      query: q.trim(),
      contacts: contactResults,
      companies: companyResults,
      actions: actionResults,
      ideas: ideaResults,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

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
    contactName: cc.conversation.contact.name,
  }));

  return related;
}

export default router;
