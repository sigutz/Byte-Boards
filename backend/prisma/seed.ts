import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TRAITS: { name: string; description: string }[] = [
  { name: 'Empathic',     description: 'Cooperates when it benefits long-term standing and avoids hostile moves.' },
  { name: 'Greedy',       description: 'Maximizes own resource accumulation above all else.' },
  { name: 'HardTrader',   description: 'Exploits 4:1 bank trades aggressively whenever there is a surplus.' },
  { name: 'Aggressive',   description: 'Blocks opponents and claims territory before them.' },
  { name: 'Expansionist', description: 'Spreads settlements and roads to dominate the board.' },
  { name: 'Defensive',    description: 'Secures existing positions before expanding further.' },
  { name: 'SmartBuilder', description: 'Saves resources patiently and only builds when the optimal structure is affordable.' },
  { name: 'FastSpender',  description: 'Spends resources immediately whenever any build action is available.' },
  { name: 'DevFocused',   description: 'Prioritizes buying development cards over physical buildings and saves towards them.' },
];

// Bidirectional — each pair listed once; seed inserts both directions.
const CONFLICT_PAIRS: [string, string][] = [
  ['Empathic',     'Aggressive'],
  ['Empathic',     'Greedy'],
  ['Aggressive',   'Defensive'],
  ['Expansionist', 'Defensive'],
  ['Expansionist', 'DevFocused'],
  ['SmartBuilder', 'FastSpender'],
  ['SmartBuilder', 'Greedy'],
  ['FastSpender',  'DevFocused'],
];

async function main() {
  console.log('Seeding traits…');

  // Upsert all traits
  for (const t of TRAITS) {
    await prisma.trait.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description },
    });
  }

  // Build name → id map
  const rows = await prisma.trait.findMany({ select: { id: true, name: true } });
  const idOf = Object.fromEntries(rows.map(r => [r.name, r.id]));

  // Clear existing conflicts and re-insert (idempotent)
  await prisma.traitConflict.deleteMany();
  for (const [a, b] of CONFLICT_PAIRS) {
    const aId = idOf[a];
    const bId = idOf[b];
    if (!aId || !bId) { console.warn(`Unknown trait in conflict pair: ${a} ↔ ${b}`); continue; }
    // Insert both directions so queries only need sourceId
    await prisma.traitConflict.createMany({
      data: [
        { sourceId: aId, targetId: bId },
        { sourceId: bId, targetId: aId },
      ],
      skipDuplicates: true,
    });
  }

  console.log(`Seeded ${TRAITS.length} traits and ${CONFLICT_PAIRS.length * 2} conflict records.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
