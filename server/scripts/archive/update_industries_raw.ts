import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const targetCompanies = [
    "Acertitude",
    "Allen Austin",
    "AltoPartners",
    "AMN Healthcare",
    "Battalia Winston",
    "Bowdoin Group",
    "Boyden",
    "Buffkin / Baker",
    "Caldwell Partners International",
    "Charles Aris, Inc.",
    "Chasm Partners",
    "Comhar Partners",
    "DHR Global",
    "Direct Recruiters, Inc.",
    "Diversified Search Group",
    "ECA Partners",
    "Egon Zehnder",
    "EMA Partners",
    "FaithSearch Partners",
    "Hartz Search",
    "HealthSearch Partners",
    "Heidrick & Struggles",
    "JM Search",
    "Jordan Search Consultants",
    "Kaye/Bassman International",
    "Kestria",
    "Kirby Bates Associates",
    "Klein Hersh",
    "Korn Ferry",
    "Lindauer",
    "McDermott + Bull",
    "Mirams Becker",
    "Odgers Berndtson",
    "Olympus Search Partners",
    "ON Partners",
    "Perrett Laver",
    "Quick Leonard Kiefer",
    "Riviera Partners",
    "Ross & Company",
    "Rudish Health",
    "Russell Reynolds",
    "Slone Partners",
    "Spencer Stuart",
    "SPMB Executive Search",
    "Stanton Chase",
    "Strawn Arnold",
    "Strawn Arnold ",
    "Talentor International",
    "The Tolan Group",
    "TriSearch",
    "True Search",
    "WittKieffer",
    "ZRG Partners",
    "August Leadership",
    "BrainWorks",
    "CIO Partners ",
    "CTORecruiter",
    "Heller Search Associates",
    "IIC Partners Executive Search Worldwide",
    "Leathwaite",
    "StevenDouglas",
    "The Good Search",
    "TRANSEARCH International",
    "Wilton & Bain",
    "33eleven",
    "Aequitas Partners",
    "AMN Healthcare Leadership | B.E. Smith",
    "Argosight",
    "Auerbach Associates, Inc.",
    "Avant Executive Search",
    "Bedford Group/TRANSEARCH",
    "Bench International",
    "Benson Executive Search",
    "Bespoke Partners",
    "Brandon Becker",
    "Bridge Partners",
    "BridgeStreet Partners",
    "Business Talent Group",
    "Calibre One",
    "Cantor Integrated Marketing Staffing, Inc.",
    "Catalyst Advisors LP",
    "Centerstone Executive Search",
    "Chaloner",
    "ChampionScott Partners",
    "Charles Aris Inc.",
    "Chartwell Partners",
    "Coleman Lew Canny Bowen",
    "Connexus Group, LLC",
    "Cross Country Healthcare",
    "Daly & Company, Inc.",
    "Daversa Partners",
    "Development Guild DDI",
    "Dickson Smith & Company, Inc.",
    "DRG Search",
    "DSG Global",
    "Etkin Executive Search Group",
    "Ferguson Partners",
    "Ford Webb Associates, Inc.",
    "Gilbert Tweed International",
    "Gosselin/Martin Associates",
    "GQR",
    "Hanover",
    "Harvard Group International",
    "Heyman Associates",
    "Highspring",
    "Howe-Lewis International",
    "Hudson Gain Corporation",
    "Hudson RPO",
    "INSPYR Solutions",
    "Integrated Search Solutions Group",
    "Isaacson, Miller",
    "Jackowitz & Company",
    "Jackson Physician Search",
    "Jacqz Co.",
    "JB Homer Associates",
    "JBK Associates International",
    "Jobplex",
    "Kenzer Group, LLC",
    "Kindred Partners, LLC",
    "Korn Ferry Professional Search",
    "L&E Partners",
    "Major Executive Search",
    "Mary, Jane and Associates",
    "Mattson and Company",
    "McCormack+Kristel",
    "McGahey Group",
    "Metric Bio",
    "Modern Executive Solutions",
    "MTK Resources",
    "My HR Department",
    "N2Growth",
    "NGS Global",
    "North Highland",
    "Occam Global",
    "Odgers",
    "OnPoint Partners, Inc.",
    "Opus Partners",
    "Ormsby Park",
    "Oxeon Search",
    "Pact & Partners",
    "Park Square Executive Search",
    "Patina - A Korn Ferry Company",
    "Pearl360 Partners, LLC",
    "peoplepath",
    "Phillips DiPisa",
    "PierceGray",
    "Raines International",
    "Raise",
    "rb executive search",
    "Reaction Search International",
    "RJ Industries",
    "Robert Half Executive Search",
    "RobinsonButler",
    "Roo Partners",
    "RSA Executive Search",
    "RSR Partners",
    "Russell Reynolds Associates",
    "Seiden Krieger Associates, Inc.",
    "Slalom",
    "Snowden Associates",
    "Soul Search Partners",
    "Stevenson Search Partners",
    "Stiles Associates",
    "StraussGroup",
    "Tandym Group",
    "Taylor Strategy Partners",
    "Tegria",
    "The Alexander Group",
    "The ExeQfind Group",
    "The HealthSearch Group",
    "The HiPo Network",
    "The IMC Group",
    "The Lancer Group",
    "The Landstone Group",
    "The Leadership Group",
    "Top Gun Ventures, LLC",
    "Upwell Search Partners",
    "Vital Search Partners",
    "WorldBridge Partners",
    "ZurickDavis"
];

// Note: Ensure TURSO is uncommented in .env before running this script
// Oh wait we can just read the file and extract it directly here to bypass having to modify .env manually
import fs from 'fs';
import path from 'path';

async function main() {
    console.log('Reading .env for Turso credentials...');
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

    if (!tursoUrl || !tursoToken) {
        throw new Error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not found in .env');
    }

    const client = createClient({
        url: tursoUrl,
        authToken: tursoToken,
    });

    console.log(`Fetching all companies from Turso...`);
    const rs = await client.execute("SELECT id, name FROM Company");

    // Create a map of lowercase name to array of company IDs
    const companyMap = new Map<string, number[]>();
    for (const row of rs.rows) {
        const id = row.id as number;
        const name = row.name as string;
        const lowerName = name.toLowerCase().trim();
        if (!companyMap.has(lowerName)) {
            companyMap.set(lowerName, []);
        }
        companyMap.get(lowerName)!.push(id);
    }

    console.log(`Starting to update companies to 'Recruiting' industry...`);
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundNames: string[] = [];

    for (const name of targetCompanies) {
        const trimmedName = name.trim();
        if (!trimmedName) continue;

        const lowerTarget = trimmedName.toLowerCase();
        const matchedCompanyIds = companyMap.get(lowerTarget);

        if (!matchedCompanyIds || matchedCompanyIds.length === 0) {
            notFoundCount++;
            notFoundNames.push(trimmedName);
            continue;
        }

        // Update all matching companies
        for (const id of matchedCompanyIds) {
            await client.execute({
                sql: "UPDATE Company SET industry = 'Recruiting' WHERE id = ?",
                args: [id]
            });
            updatedCount++;
        }
    }

    console.log(`\nResults:`);
    console.log(`- Successfully updated: ${updatedCount} companies`);
    console.log(`- Not found: ${notFoundCount} companies`);
    if (notFoundNames.length > 0) {
        console.log(`- Companies not found in DB:\n  ${notFoundNames.join('\n  ')}`);
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
