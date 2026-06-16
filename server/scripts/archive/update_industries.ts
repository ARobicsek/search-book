import * as dotenv from 'dotenv';
dotenv.config();

import prisma from './src/db';

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

async function main() {
    console.log(`Fetching all companies...`);
    const allCompanies = await prisma.company.findMany();

    // Create a map of lowercase name to array of companies
    const companyMap = new Map<string, any[]>();
    for (const c of allCompanies) {
        const lowerName = c.name.toLowerCase().trim();
        if (!companyMap.has(lowerName)) {
            companyMap.set(lowerName, []);
        }
        companyMap.get(lowerName)!.push(c);
    }

    console.log(`Starting to update companies to 'Recruiting' industry...`);
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundNames: string[] = [];

    for (const name of targetCompanies) {
        const trimmedName = name.trim();
        if (!trimmedName) continue;

        const lowerTarget = trimmedName.toLowerCase();
        const matchedCompanies = companyMap.get(lowerTarget);

        if (!matchedCompanies || matchedCompanies.length === 0) {
            notFoundCount++;
            notFoundNames.push(trimmedName);
            continue;
        }

        // Update all matching companies
        for (const c of matchedCompanies) {
            await prisma.company.update({
                where: { id: c.id },
                data: { industry: 'Recruiting' }
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
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
