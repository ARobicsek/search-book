import 'dotenv/config';
import prisma from './db';

async function main() {
    try {
        const contact = await prisma.contact.create({
            data: {
                name: 'Repro Blank Screen Contact',
                additionalCompanyIds: JSON.stringify([{ id: 6, isCurrent: false }]),
                // Add other minimal required fields
                ecosystem: 'ROLODEX',
                status: 'CONNECTED',
            },
        });
        console.log('Created contact:', contact);

        // Fetch it back to see how prisma returns it
        const fetched = await prisma.contact.findUnique({
            where: { id: contact.id },
        });
        console.log('Fetched contact:', fetched);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
