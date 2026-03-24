
import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./dev.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Connecting to DB...');
    try {
        const lastContacts = await prisma.contact.findMany({
            take: 2,
            orderBy: {
                id: 'desc',
            },
            select: {
                id: true,
                name: true,
                roleDescription: true,
                additionalCompanyIds: true,
                companyName: true,
                additionalEmails: true,
            }
        });

        console.log('Last Contact Fields:');
        lastContacts.forEach(c => {
            console.log(`ID: ${c.id}`);
            console.log(`Name: ${c.name}`);
            console.log(`RoleDesc: ${JSON.stringify(c.roleDescription)}`);
            console.log(`AddCoIds: ${JSON.stringify(c.additionalCompanyIds)}`);
            console.log(`AddEmails: ${JSON.stringify(c.additionalEmails)}`);
            console.log('---');
        });
    } catch (e) {
        console.error('Error querying DB:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
