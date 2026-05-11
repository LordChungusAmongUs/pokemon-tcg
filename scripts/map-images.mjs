/**
 * Matches local image files to cards in cards-raw.json.
 * Run after fetch-card-data.mjs: node scripts/map-images.mjs
 * Output: data/image-map.json + data/unmatched-images.json
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RARITY_FOLDERS = ['Common', 'Uncommon', 'Rare', 'Legendary'];

// Map set name fragments in filenames → pokemontcg.io set IDs
const SET_NAME_MAP = {
  'baseset': 'base1',
  'base set': 'base1',
  'jungle': 'base2',
  'fossil': 'base3',
  'baseset2': 'base4',
  'teamrocket': 'base5',
  'team rocket': 'base5',
  'gymheroes': 'gym1',
  'gym heroes': 'gym1',
  'gymchallenge': 'gym2',
  'gym challenge': 'gym2',
  'neogenesis': 'neo1',
  'neodiscovery': 'neo2',
  'neorevelation': 'neo3',
  'neodestiny': 'neo4',
  'expedition': 'ecard1',
  'aquapolis': 'ecard2',
  'skyridge': 'ecard3',
  'rubysapphire': 'ex1',
  'ruby & sapphire': 'ex1',
  'sandstorm': 'ex2',
  'dragon': 'ex3',
  'hiddenlegends': 'ex5',
  'hidden legends': 'ex5',
  'fireredleafgreen': 'ex6',
  'firered & leafgreen': 'ex6',
  'wizardspromo': 'basep',
  'wizards promo': 'basep',
  'unlimited': 'base1',
};

function normalizeSetName(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseFilename(filename) {
  const noExt = basename(filename, extname(filename));

  // Pattern 1: "270px-AbraBaseSet43" or "LassBaseSet75"
  // Strip leading dimension prefix like "270px-", "300px-" etc.
  let cleaned = noExt.replace(/^\d+px-/i, '');

  // Try to match: <CardName><SetName><Number>
  // Set names we know: BaseSet, Jungle, Fossil, TeamRocket, GymHeroes, etc.
  const setPattern = Object.keys(SET_NAME_MAP)
    .map(k => k.replace(/[^a-z0-9]/gi, ''))
    .sort((a, b) => b.length - a.length) // longest first
    .join('|');

  const re = new RegExp(`^(.+?)(${setPattern})(\\d+)$`, 'i');
  const match = cleaned.match(re);

  if (match) {
    const cardName = match[1].trim();
    const setRaw = normalizeSetName(match[2]);
    const cardNumber = parseInt(match[3], 10);
    const setId = SET_NAME_MAP[setRaw] || null;
    return { cardName, setId, cardNumber, raw: noExt };
  }

  // Pattern 2: "2 charizard" or "0 arbok dark"
  const numNameRe = /^(\d+)\s+(.+)$/;
  const numMatch = cleaned.match(numNameRe);
  if (numMatch) {
    return {
      cardName: numMatch[2].replace(/\s+dark$/i, '').replace(/\s+promo$/i, '').trim(),
      cardNumber: parseInt(numMatch[1], 10),
      setId: null,
      raw: noExt,
    };
  }

  // Pattern 3: just a name like "s-l1600"
  return { cardName: cleaned, setId: null, cardNumber: null, raw: noExt };
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreMatch(parsed, card) {
  let score = 0;

  // Name match
  const parsedName = normalize(parsed.cardName);
  const cardName = normalize(card.name);
  if (cardName === parsedName) score += 100;
  else if (cardName.startsWith(parsedName) || parsedName.startsWith(cardName)) score += 50;
  else if (cardName.includes(parsedName) || parsedName.includes(cardName)) score += 25;

  // Set match
  if (parsed.setId && card.set?.id === parsed.setId) score += 80;

  // Number match
  if (parsed.cardNumber !== null && parseInt(card.number) === parsed.cardNumber) score += 80;

  return score;
}

function main() {
  const rawCards = JSON.parse(readFileSync(join(ROOT, 'data', 'cards-raw.json'), 'utf8'));
  console.log(`Loaded ${rawCards.length} cards from API data\n`);

  const imageMap = {};
  const unmatched = [];

  for (const folder of RARITY_FOLDERS) {
    const folderPath = join(ROOT, 'public', 'cards', folder);
    let files;
    try {
      files = readdirSync(folderPath);
    } catch {
      console.warn(`Skipping missing folder: ${folder}`);
      continue;
    }

    console.log(`Processing ${folder}/ (${files.length} files)...`);

    for (const file of files) {
      const localPath = `/cards/${folder}/${file}`;
      const parsed = parseFilename(file);

      // Score every API card and pick the best
      let best = null;
      let bestScore = 0;

      for (const card of rawCards) {
        const s = scoreMatch(parsed, card);
        if (s > bestScore) {
          bestScore = s;
          best = card;
        }
      }

      const MIN_SCORE = 80; // require at least name + one other field
      if (best && bestScore >= MIN_SCORE) {
        // Only override existing match if this score is strictly better
        const existing = imageMap[best.id];
        if (!existing || bestScore > existing.score) {
          imageMap[best.id] = {
            localPath,
            folder,
            filename: file,
            score: bestScore,
          };
        }
      } else {
        unmatched.push({
          file,
          folder,
          localPath,
          parsed,
          bestGuess: best ? { id: best.id, name: best.name, set: best.set?.name, score: bestScore } : null,
        });
      }
    }
  }

  writeFileSync(join(ROOT, 'data', 'image-map.json'), JSON.stringify(imageMap, null, 2));
  writeFileSync(join(ROOT, 'data', 'unmatched-images.json'), JSON.stringify(unmatched, null, 2));

  const matchedCount = Object.keys(imageMap).length;
  const totalFiles = RARITY_FOLDERS.reduce((sum, f) => {
    try { return sum + readdirSync(join(ROOT, 'public', 'cards', f)).length; } catch { return sum; }
  }, 0);

  console.log(`\nResults:`);
  console.log(`  Matched:   ${matchedCount} / ${totalFiles} images`);
  console.log(`  Unmatched: ${unmatched.length} images`);
  console.log(`\nSaved data/image-map.json and data/unmatched-images.json`);
  console.log(`\nReview data/unmatched-images.json and add fixes to data/manual-patches.json`);
}

main();
