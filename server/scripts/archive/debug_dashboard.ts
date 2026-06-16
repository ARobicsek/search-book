import 'dotenv/config';
import prisma from './db';

async function main() {
    console.log('Testing Dashboard Queries...');
    try {
        const today = new Date().toLocaleDateString('en-CA');

        console.log('Fetching pending actions...');
        const pending = await prisma.action.findMany({
            where: { completed: false },
            include: {
                contact: { select: { id: true, name: true } },
                company: { select: { id: true, name: true } },
                conversation: { select: { id: true, summary: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }]
        });
        console.log(`Pending actions: ${pending.length}`);

        console.log('Fetching overdue actions...');
        const overdue = await prisma.action.findMany({
            where: {
                completed: false,
                dueDate: { lt: today }
            },
            include: {
                contact: { select: { id: true, name: true } },
                company: { select: { id: true, name: true } },
                conversation: { select: { id: true, summary: true } },
            },
            orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }]
        });
        console.log(`Overdue actions: ${overdue.length}`);

        console.log('Queries completed successfully.');

    } catch (e) {
        console.error('Query failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
