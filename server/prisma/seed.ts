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
