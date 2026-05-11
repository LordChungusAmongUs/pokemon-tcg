export interface Format {
  id: string;
  name: string;
  sets: string[];
}

// Historical WotC-era rotation formats (cumulative — all sets legal up to that point)
export const FORMATS: Format[] = [
  {
    id: 'base-jungle',
    name: 'Base–Jungle',
    sets: ['Base', 'Jungle'],
  },
  {
    id: 'base-fossil',
    name: 'Base–Fossil',
    sets: ['Base', 'Jungle', 'Fossil'],
  },
  {
    id: 'base-rocket',
    name: 'Base–Team Rocket',
    sets: ['Base', 'Jungle', 'Fossil', 'Team Rocket'],
  },
  {
    id: 'base-gym',
    name: 'Base–Gym Challenge',
    sets: ['Base', 'Jungle', 'Fossil', 'Team Rocket', 'Gym Heroes', 'Gym Challenge'],
  },
  {
    id: 'base-neo2',
    name: 'Base–Neo Discovery',
    sets: ['Base', 'Jungle', 'Fossil', 'Team Rocket', 'Gym Heroes', 'Gym Challenge', 'Neo Genesis', 'Neo Discovery'],
  },
  {
    id: 'base-neo4',
    name: 'Base–Neo Revelation',
    sets: ['Base', 'Jungle', 'Fossil', 'Team Rocket', 'Gym Heroes', 'Gym Challenge', 'Neo Genesis', 'Neo Discovery', 'Neo Revelation', 'Neo Destiny'],
  },
  {
    id: 'neo-genesis-rev',
    name: 'Neo Genesis–Revelation',
    sets: ['Neo Genesis', 'Neo Discovery', 'Neo Revelation'],
  },
  {
    id: 'full-wizards',
    name: 'Full Wizards Era',
    sets: [
      'Base', 'Jungle', 'Fossil', 'Team Rocket',
      'Gym Heroes', 'Gym Challenge',
      'Neo Genesis', 'Neo Discovery', 'Neo Revelation', 'Neo Destiny',
      'Expedition Base Set', 'Aquapolis', 'Skyridge',
      'Wizards Black Star Promos',
    ],
  },
  {
    id: 'ex-era',
    name: 'EX Era',
    sets: ['Ruby & Sapphire', 'Sandstorm', 'Dragon', 'Team Magma vs Team Aqua', 'Hidden Legends', 'FireRed & LeafGreen'],
  },
];
