/**
 * Fetches card data from pokemontcg.io for all sets represented in our image collection.
 * Run once: node scripts/fetch-card-data.mjs
 * Output: data/cards-raw.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Sets we have images for based on filename analysis
const SET_CODES = [
  'base1',      // Base Set
  'base2',      // Jungle
  'base3',      // Fossil
  'base4',      // Base Set 2
  'base5',      // Team Rocket
  'gym1',       // Gym Heroes
  'gym2',       // Gym Challenge
  'neo1',       // Neo Genesis
  'neo2',       // Neo Discovery
  'neo3',       // Neo Revelation
  'neo4',       // Neo Destiny
  'ecard1',     // Expedition Base Set
  'ecard2',     // Aquapolis
  'ecard3',     // Skyridge
  'ex1',        // EX Ruby & Sapphire
  'ex2',        // EX Sandstorm
  'ex3',        // EX Dragon
  'ex4',        // EX Team Magma vs Team Aqua
  'ex5',        // EX Hidden Legends
  'ex6',        // EX FireRed & LeafGreen
  'dp1',        // Wizards Promo
  'basep',      // Wizards Black Star Promos
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSetCards(setCode) {
  const pageSize = 250;
  let page = 1;
  let allCards = [];

  while (true) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setCode}&pageSize=${pageSize}&page=${page}`;
    console.log(`  Fetching ${setCode} page ${page}...`);

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  Warning: ${setCode} returned ${res.status}`);
      break;
    }

    const json = await res.json();
    allCards = allCards.concat(json.data || []);

    if (!json.data || json.data.length < pageSize) break;
    page++;
    await delay(200);
  }

  return allCards;
}

async function main() {
  console.log('Fetching card data from pokemontcg.io...\n');
  mkdirSync(join(ROOT, 'data'), { recursive: true });

  const allCards = [];

  for (const setCode of SET_CODES) {
    console.log(`Set: ${setCode}`);
    try {
      const cards = await fetchSetCards(setCode);
      allCards.push(...cards);
      console.log(`  -> ${cards.length} cards\n`);
    } catch (err) {
      console.warn(`  Failed to fetch ${setCode}:`, err.message);
    }
    await delay(300);
  }

  const outPath = join(ROOT, 'data', 'cards-raw.json');
  writeFileSync(outPath, JSON.stringify(allCards, null, 2));
  console.log(`\nDone! Saved ${allCards.length} total cards to data/cards-raw.json`);
}

main().catch(console.error);
