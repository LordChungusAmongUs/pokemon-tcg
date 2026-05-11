/**
 * Merges API card data + image map + manual patches into data/cards.json.
 * Run after map-images.mjs: node scripts/build-cards-json.mjs
 * Output: data/cards.json (committed to repo, used by the app)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseDamage(damageStr) {
  if (!damageStr) return 0;
  const match = damageStr.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function transformCard(apiCard, localPath) {
  return {
    id: apiCard.id,
    name: apiCard.name,
    set: apiCard.set?.name || '',
    setCode: apiCard.set?.id || '',
    number: apiCard.number || '',
    rarity: apiCard.rarity || '',
    supertype: apiCard.supertype || '',  // Pokemon / Trainer / Energy
    subtype: apiCard.subtypes?.[0] || '',
    evolvesFrom: apiCard.evolvesFrom || null,
    hp: apiCard.hp ? parseInt(apiCard.hp) : null,
    types: apiCard.types || [],
    attacks: (apiCard.attacks || []).map(a => ({
      name: a.name,
      cost: a.cost || [],
      damage: parseDamage(a.damage),
      damageStr: a.damage || '',
      text: a.text || '',
    })),
    abilities: (apiCard.abilities || []).map(a => ({
      name: a.name,
      type: a.type,
      text: a.text || '',
    })),
    weaknesses: (apiCard.weaknesses || []).map(w => ({ type: w.type, value: w.value })),
    resistances: (apiCard.resistances || []).map(r => ({ type: r.type, value: r.value })),
    retreatCost: apiCard.retreatCost || [],
    rules: apiCard.rules || [],
    localImagePath: localPath || null,
    apiImageUrl: apiCard.images?.small || null,
  };
}

function main() {
  const rawCards = JSON.parse(readFileSync(join(ROOT, 'data', 'cards-raw.json'), 'utf8'));
  const imageMap = JSON.parse(readFileSync(join(ROOT, 'data', 'image-map.json'), 'utf8'));

  // Load manual patches if they exist
  const patchesPath = join(ROOT, 'data', 'manual-patches.json');
  const patches = existsSync(patchesPath)
    ? JSON.parse(readFileSync(patchesPath, 'utf8'))
    : {};

  // Merge image map with patches
  const fullImageMap = { ...imageMap };
  for (const [cardId, patch] of Object.entries(patches)) {
    fullImageMap[cardId] = patch;
  }

  // Build the final card list — include ALL fetched cards; local image is preferred, apiImageUrl is fallback
  const cards = [];
  const cardIds = new Set();

  for (const apiCard of rawCards) {
    if (cardIds.has(apiCard.id)) continue;

    const imgEntry = fullImageMap[apiCard.id];
    // Skip if patch explicitly nulled out this card
    if (imgEntry && imgEntry.localPath === null && !apiCard.images?.small) continue;

    cardIds.add(apiCard.id);
    // Use local path if available and not null-patched, otherwise fall back to apiImageUrl
    const localPath = (imgEntry && imgEntry.localPath) ? imgEntry.localPath : null;
    cards.push(transformCard(apiCard, localPath));
  }

  // Sort by set, then number
  cards.sort((a, b) => {
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode);
    return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
  });

  const outPath = join(ROOT, 'data', 'cards.json');
  writeFileSync(outPath, JSON.stringify(cards, null, 2));

  const byType = cards.reduce((acc, c) => {
    acc[c.supertype] = (acc[c.supertype] || 0) + 1;
    return acc;
  }, {});

  console.log(`\nBuilt data/cards.json with ${cards.length} cards:`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
}

main();
