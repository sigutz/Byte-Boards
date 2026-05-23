export type Trait = 'Empathic' | 'Greedy' | 'HardTrader' | 'Aggressive' | 'Expansionist' | 'Defensive';

export const ALL_TRAITS: Trait[] = [
  'Empathic', 'Greedy', 'HardTrader', 'Aggressive', 'Expansionist', 'Defensive',
];

const CONFLICTS: Partial<Record<Trait, Trait[]>> = {
  Empathic:     ['Aggressive', 'Greedy'],
  Aggressive:   ['Empathic', 'Defensive'],
  Expansionist: ['Defensive'],
};

export function validateTraits(traits: Trait[]): boolean {
  for (let i = 0; i < traits.length; i++) {
    const conflicts = CONFLICTS[traits[i]] ?? [];
    for (let j = i + 1; j < traits.length; j++) {
      if (conflicts.includes(traits[j])) return false;
    }
  }
  return true;
}

export function randomTraits(count: number): Trait[] {
  const shuffled = [...ALL_TRAITS].sort(() => Math.random() - 0.5);
  const result: Trait[] = [];
  for (const t of shuffled) {
    if (validateTraits([...result, t])) {
      result.push(t);
      if (result.length === count) break;
    }
  }
  return result;
}

const FIXED_TRAITS: Record<string, Trait[]> = {
  HexaMind:   ['Expansionist', 'Aggressive'],
  RoadRunner: ['Aggressive', 'HardTrader'],
  PortTrader: ['Greedy', 'HardTrader'],
  SheepBaron: ['Greedy', 'Defensive'],
};

export function getAgentTraits(agentName: string): Trait[] {
  return FIXED_TRAITS[agentName] ?? randomTraits(2);
}

export const TRAIT_DESCRIPTIONS: Record<Trait, string> = {
  Empathic:     'You cooperate when it benefits long-term standing and avoid hostile moves.',
  Greedy:       'You maximize your own resource accumulation above all else.',
  HardTrader:   'You exploit 4:1 bank trades aggressively whenever you have surplus.',
  Aggressive:   'You block opponents and claim territory before them.',
  Expansionist: 'You spread settlements and roads to dominate the board.',
  Defensive:    'You secure existing positions before expanding further.',
};

export const TRAIT_CONFLICTS: Partial<Record<Trait, Trait[]>> = CONFLICTS;

export function buildSystemPrompt(agentName: string, traits: Trait[]): string {
  const traitText = traits.map(t => TRAIT_DESCRIPTIONS[t]).join(' ');
  return (
    `You are ${agentName}, a Catan AI agent. ${traitText} ` +
    `Respond with valid JSON only, matching exactly the schema provided. First to 10 VP wins.`
  );
}
