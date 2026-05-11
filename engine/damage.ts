import type { InPlayPokemon, CardAttack, EnergyType } from './GameState';

export function calculateDamage(
  attackerTypes: EnergyType[],
  attack: CardAttack,
  defender: InPlayPokemon,
): number {
  let damage = attack.damage;
  if (damage === 0) return 0;

  const defenderCard = defender.card;
  const attackerType = attackerTypes[0];

  // Weakness (old TCG: ×2)
  if (attackerType && defenderCard.weaknesses.some(w => w.type === attackerType)) {
    const val = defenderCard.weaknesses.find(w => w.type === attackerType)!.value;
    if (val.startsWith('×') || val.startsWith('x')) {
      damage *= parseInt(val.replace(/[×x]/, '')) || 2;
    } else {
      damage += parseInt(val.replace('+', '')) || 0;
    }
  }

  // Resistance (old TCG: −30)
  if (attackerType && defenderCard.resistances.some(r => r.type === attackerType)) {
    const val = defenderCard.resistances.find(r => r.type === attackerType)!.value;
    damage -= Math.abs(parseInt(val.replace(/[-−]/, '')) || 30);
    damage = Math.max(0, damage);
  }

  return damage;
}

export function applyPoisonDamage(pokemon: InPlayPokemon): InPlayPokemon {
  if (pokemon.statusCondition !== 'Poisoned') return pokemon;
  return { ...pokemon, damageTaken: pokemon.damageTaken + 10 };
}

export function applyBurnDamage(pokemon: InPlayPokemon): InPlayPokemon {
  if (pokemon.statusCondition !== 'Burned') return pokemon;
  // Flip coin: heads = remove burn, tails = 20 damage
  const heads = Math.random() < 0.5;
  if (heads) return { ...pokemon, statusCondition: null };
  return { ...pokemon, damageTaken: pokemon.damageTaken + 20 };
}

export function isKnockedOut(pokemon: InPlayPokemon): boolean {
  if (!pokemon.card.hp) return false;
  return pokemon.damageTaken >= pokemon.card.hp;
}
