import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

async function main() {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    let tursoUrl = '';
    let tursoToken = '';
    for (const line of envContent.split('\n')) {
        if (line.includes('TURSO_DATABASE_URL')) {
            const match = line.match(/TURSO_DATABASE_URL="(.*)"/);
            if (match) tursoUrl = match[1];
        }
        if (line.includes('TURSO_AUTH_TOKEN')) {
            const match = line.match(/TURSO_AUTH_TOKEN="(.*)"/);
            if (match) tursoToken = match[1];
        }
    }

    const client = createClient({
        url: tursoUrl,
        authToken: tursoToken,
    });

    const rs = await client.execute("SELECT name FROM Company WHERE industry = 'Recruiting' LIMIT 10");
    console.log(rs.rows.map(r => r.name).join(', '));
}

main().catch(console.error);
