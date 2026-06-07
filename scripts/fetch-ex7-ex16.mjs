/**
 * Fetches EX sets ex7–ex16 (Team Rocket Returns → Power Keepers) from
 * pokemontcg.io, appends them to data/cards-raw.json (skipping any card IDs
 * already present), then rebuilds data/cards.json via build-cards-json.mjs.
 *
 * Run from the project root:
 *   node scripts/fetch-ex7-ex16.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// The 10 missing EX sets between FireRed & LeafGreen and Diamond & Pearl
const NEW_SET_CODES = [
  'ex7',   // Team Rocket Returns
  'ex8',   // Deoxys
  'ex9',   // Emerald
  'ex10',  // Unseen Forces
  'ex11',  // Delta Species
  'ex12',  // Legend Maker
  'ex13',  // Holon Phantoms
  'ex14',  // Crystal Guardians
  'ex15',  // Dragon Frontiers
  'ex16',  // Power Keepers
];

// Expected set names (must match what the API returns so progression.ts is correct)
const EXPECTED_NAMES = {
  ex7:  'Team Rocket Returns',
  ex8:  'Deoxys',
  ex9:  'Emerald',
  ex10: 'Unseen Forces',
  ex11: 'Delta Species',
  ex12: 'Legend Maker',
  ex13: 'Holon Phantoms',
  ex14: 'Crystal Guardians',
  ex15: 'Dragon Frontiers',
  ex16: 'Power Keepers',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchSetCards(setCode) {
  const pageSize = 250;
  let page = 1;
  const all = [];
  while (true) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setCode}&pageSize=${pageSize}&page=${page}`;
    process.stdout.write(`  fetching page ${page}…`);
    const res = await fetch(url);
    if (!res.ok) { console.log(` HTTP ${res.status}`); break; }
    const json = await res.json();
    all.push(...(json.data || []));
    console.log(` got ${json.data?.length ?? 0} cards`);
    if (!json.data || json.data.length < pageSize) break;
    page++;
    await delay(250);
  }
  return all;
}

async function main() {
  // Load existing raw cards
  const rawPath = join(ROOT, 'data', 'cards-raw.json');
  console.log('Loading existing cards-raw.json…');
  const existing = JSON.parse(readFileSync(rawPath, 'utf8'));
  const existingIds = new Set(existing.map(c => c.id));
  console.log(`  ${existing.length} cards already present.\n`);

  const actualNames = {};  // code → actual API set name
  const newCards = [];

  for (const code of NEW_SET_CODES) {
    console.log(`\n── ${code} (expected: "${EXPECTED_NAMES[code]}") ──`);
    try {
      const cards = await fetchSetCards(code);
      let added = 0;
      for (const c of cards) {
        if (!existingIds.has(c.id)) {
          newCards.push(c);
          existingIds.add(c.id);
          added++;
        }
      }
      const apiName = cards[0]?.set?.name ?? '(unknown)';
      actualNames[code] = apiName;
      const match = apiName === EXPECTED_NAMES[code] ? '✓' : `⚠ MISMATCH — actual: "${apiName}"`;
      console.log(`  ${added} new cards added  ${match}`);
    } catch (err) {
      console.warn(`  ✗ Failed:`, err.message);
    }
    await delay(350);
  }

  if (newCards.length === 0) {
    console.log('\nNo new cards to add — fetch may have failed entirely.\n');
    console.log('Check your internet connection and try again.');
    return;
  }

  // Append and save raw cards
  const merged = [...existing, ...newCards];
  writeFileSync(rawPath, JSON.stringify(merged, null, 2));
  console.log(`\n✓ cards-raw.json: ${existing.length} → ${merged.length} cards (+${newCards.length})\n`);

  // Check if any set names differ from what progression.ts expects
  const mismatches = Object.entries(actualNames).filter(
    ([code, name]) => name !== EXPECTED_NAMES[code]
  );
  if (mismatches.length > 0) {
    console.log('⚠ Some API set names differ from progression.ts entries:');
    for (const [code, actual] of mismatches) {
      console.log(`  ${code}: expected "${EXPECTED_NAMES[code]}", got "${actual}"`);
    }
    console.log('  → Auto-patching lib/progression.ts…');

    const progPath = join(ROOT, 'lib', 'progression.ts');
    let progSrc = readFileSync(progPath, 'utf8');
    for (const [code, actual] of mismatches) {
      const expected = EXPECTED_NAMES[code];
      progSrc = progSrc.replaceAll(`'${expected}'`, `'${actual}'`);
    }
    writeFileSync(progPath, progSrc);
    console.log('  ✓ progression.ts patched.');
  }

  // Rebuild cards.json
  console.log('\nRebuilding data/cards.json…');
  execSync('node scripts/build-cards-json.mjs', { cwd: ROOT, stdio: 'inherit' });
  console.log('\n✅ All done! Commit data/cards.json and lib/progression.ts to deploy.');
}

main().catch(console.error);
