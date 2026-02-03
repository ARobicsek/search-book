import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Companies
  const acmeCorp = await prisma.company.create({
    data: {
      name: 'Acme Corp',
      industry: 'Technology',
      size: '1000-5000',
      website: 'https://acme.example.com',
      hqLocation: 'San Francisco, CA',
      status: 'ACTIVE_TARGET',
      notes: 'Strong engineering culture, growing AI division.',
    },
  });

  const globalFinance = await prisma.company.create({
    data: {
      name: 'Global Finance Partners',
      industry: 'Financial Services',
      size: '500-1000',
      hqLocation: 'New York, NY',
      status: 'RESEARCHING',
      notes: 'Looking for digital transformation leadership.',
    },
  });

  const summitConsulting = await prisma.company.create({
    data: {
      name: 'Summit Consulting Group',
      industry: 'Management Consulting',
      size: '100-500',
      website: 'https://summit.example.com',
      hqLocation: 'Chicago, IL',
      status: 'CONNECTED',
    },
  });

  // Contacts
  const sarah = await prisma.contact.create({
    data: {
      name: 'Sarah Chen',
      title: 'VP of Engineering',
      companyId: acmeCorp.id,
      ecosystem: 'TARGET',
      email: 'sarah@example.com',
      linkedinUrl: 'https://linkedin.com/in/sarahchen',
      location: 'San Francisco, CA',
      status: 'WARM_LEAD',
      howConnected: 'Met at TechCrunch Disrupt 2025',
      openQuestions: 'What is the team structure? What are current priorities for Q2?',
      notes: 'Very approachable. Interested in leadership development.',
    },
  });

  const marcus = await prisma.contact.create({
    data: {
      name: 'Marcus Johnson',
      title: 'Executive Recruiter',
      companyName: 'TopTier Search',
      ecosystem: 'RECRUITER',
      email: 'marcus@toptier.example.com',
      phone: '(212) 555-0199',
      location: 'New York, NY',
      status: 'CONNECTED',
      howConnected: 'Referred by David Kim',
      notes: 'Specializes in C-suite and VP-level tech roles. Good track record.',
    },
  });

  await prisma.contact.create({
    data: {
      name: 'Priya Patel',
      title: 'Managing Director',
      companyId: globalFinance.id,
      ecosystem: 'ROLODEX',
      email: 'priya@example.com',
      location: 'New York, NY',
      status: 'FOLLOW_UP_NEEDED',
      howConnected: 'Former colleague at BigBank',
      referredById: sarah.id,
      mutualConnections: 'David Kim, Lisa Wong',
      openQuestions: 'Is the CTO role still open? Would she make an intro?',
    },
  });

  await prisma.contact.create({
    data: {
      name: 'David Kim',
      title: 'Partner',
      companyId: summitConsulting.id,
      ecosystem: 'INFLUENCER',
      linkedinUrl: 'https://linkedin.com/in/davidkim',
      location: 'Chicago, IL',
      status: 'CONNECTED',
      howConnected: 'MBA classmate',
      referredById: marcus.id,
      whereFound: 'Spoke at Digital Transformation Summit 2025',
      notes: 'Well-connected in Chicago tech scene. Offered to make introductions.',
    },
  });

  await prisma.contact.create({
    data: {
      name: 'Dr. Emily Rodriguez',
      title: 'Professor of Management',
      companyName: 'Stanford GSB',
      ecosystem: 'ACADEMIA',
      email: 'erodriguez@stanford.example.edu',
      location: 'Palo Alto, CA',
      status: 'NEW',
      howConnected: 'Alumni event speaker',
      notes: 'Research on executive transitions. Could be a good reference.',
    },
  });

  // Actions — mix of dates relative to today
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  await prisma.action.create({
    data: {
      title: 'Follow up with Sarah on Q2 priorities',
      type: 'FOLLOW_UP',
      priority: 'HIGH',
      dueDate: fmt(today),
      contactId: sarah.id,
      companyId: acmeCorp.id,
    },
  });

  await prisma.action.create({
    data: {
      title: 'Send thank-you email to Marcus',
      type: 'EMAIL',
      priority: 'MEDIUM',
      dueDate: fmt(today),
      contactId: marcus.id,
    },
  });

  await prisma.action.create({
    data: {
      title: 'Research Global Finance Partners leadership team',
      description: 'Look into recent executive hires and org structure changes.',
      type: 'RESEARCH',
      priority: 'MEDIUM',
      dueDate: fmt(addDays(today, -2)),
      companyId: globalFinance.id,
    },
  });

  await prisma.action.create({
    data: {
      title: 'Prepare talking points for David Kim call',
      description: 'Review his recent speaking engagements and mutual connections.',
      type: 'WRITE',
      priority: 'HIGH',
      dueDate: fmt(addDays(today, 3)),
      contactId: sarah.id,
    },
  });

  await prisma.action.create({
    data: {
      title: 'Read Dr. Rodriguez latest paper on exec transitions',
      type: 'READ',
      priority: 'LOW',
      dueDate: fmt(addDays(today, 7)),
    },
  });

  await prisma.action.create({
    data: {
      title: 'Schedule intro call with Acme VP of Product',
      type: 'INTRO',
      priority: 'HIGH',
      dueDate: fmt(addDays(today, 5)),
      companyId: acmeCorp.id,
      contactId: sarah.id,
    },
  });

  await prisma.action.create({
    data: {
      title: 'Update resume with consulting project results',
      type: 'WRITE',
      priority: 'MEDIUM',
      dueDate: fmt(addDays(today, -5)),
      completed: true,
      completedDate: fmt(addDays(today, -4)),
    },
  });

  await prisma.action.create({
    data: {
      title: 'Send LinkedIn connection request to Summit team',
      type: 'EMAIL',
      priority: 'LOW',
      dueDate: fmt(addDays(today, 14)),
      companyId: summitConsulting.id,
    },
  });

  console.log('Seed data created successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
