export type Resource = 'wood' | 'brick' | 'ore' | 'wheat' | 'sheep';
export const RESOURCES: Resource[] = ['wood', 'brick', 'ore', 'wheat', 'sheep'];

export type Tile = { resource: Resource; number: number };

export type PlayerState = {
  agentId: number;
  name: string;
  wood: number;
  brick: number;
  ore: number;
  wheat: number;
  sheep: number;
  roads: number;
  settlements: number;
  cities: number;
  tiles: Tile[];
};

export const BUILD_COSTS: Record<string, Partial<Record<Resource, number>>> = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city:       { wheat: 2, ore: 3 },
  dev_card:   { ore: 1, wheat: 1, sheep: 1 },
};

// Numbers weighted toward high-probability rolls (5,6,8,9 appear more often)
const WEIGHTED_NUMBERS = [5, 6, 8, 9, 5, 6, 8, 9, 4, 10, 4, 10, 3, 11, 12, 2];

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function createStartingTiles(): Tile[] {
  // 5 tiles: simulates 2 settlements each touching 2-3 hexes
  return Array.from({ length: 5 }, () => ({
    resource: pickRandom(RESOURCES),
    number: pickRandom(WEIGHTED_NUMBERS),
  }));
}

export function rollDice(): [number, number] {
  return [randomInt(1, 6), randomInt(1, 6)];
}

export function collectResources(player: PlayerState, diceTotal: number): Partial<Record<Resource, number>> {
  const gained: Partial<Record<Resource, number>> = {};
  for (const tile of player.tiles) {
    if (tile.number === diceTotal) {
      // Cities produce 2 of an adjacent resource; simplified: if player has cities, +1 bonus
      const amount = player.cities > 0 ? 2 : 1;
      gained[tile.resource] = (gained[tile.resource] ?? 0) + amount;
    }
  }
  return gained;
}

export function canAfford(player: PlayerState, cost: Partial<Record<Resource, number>>): boolean {
  for (const [res, amount] of Object.entries(cost) as [Resource, number][]) {
    if (player[res] < (amount ?? 0)) return false;
  }
  return true;
}

export function totalResources(player: PlayerState): number {
  return RESOURCES.reduce((sum, r) => sum + player[r], 0);
}

export function getValidActions(player: PlayerState): string[] {
  const valid: string[] = ['pass'];

  if (canAfford(player, BUILD_COSTS.road)) valid.push('build_road');
  if (canAfford(player, BUILD_COSTS.settlement) && player.settlements < 5) valid.push('build_settlement');
  if (canAfford(player, BUILD_COSTS.city) && player.settlements > 0) valid.push('build_city');
  if (canAfford(player, BUILD_COSTS.dev_card)) valid.push('buy_dev_card');

  // 4:1 bank trade
  for (const give of RESOURCES) {
    if (player[give] >= 4) {
      for (const receive of RESOURCES) {
        if (receive !== give) valid.push(`trade_bank:${give}:${receive}`);
      }
    }
  }

  return valid;
}

export function applyAction(
  player: PlayerState,
  action: string,
): { text: string; vpDelta: number } {
  if (action === 'build_road') {
    player.wood -= 1; player.brick -= 1; player.roads += 1;
    return { text: 'builds a road', vpDelta: 0 };
  }
  if (action === 'build_settlement') {
    player.wood -= 1; player.brick -= 1; player.wheat -= 1; player.sheep -= 1;
    player.settlements += 1;
    return { text: 'builds a settlement (+1 VP)', vpDelta: 1 };
  }
  if (action === 'build_city') {
    player.wheat -= 2; player.ore -= 3;
    player.settlements -= 1; player.cities += 1;
    return { text: 'upgrades a settlement to a city (+1 VP)', vpDelta: 1 };
  }
  if (action === 'buy_dev_card') {
    player.ore -= 1; player.wheat -= 1; player.sheep -= 1;
    return { text: 'buys a development card', vpDelta: 0 };
  }
  if (action.startsWith('trade_bank:')) {
    const [, give, receive] = action.split(':') as [string, Resource, Resource];
    player[give] -= 4; player[receive] += 1;
    return { text: `trades 4 ${give} → 1 ${receive} at the bank`, vpDelta: 0 };
  }
  return { text: 'passes their turn', vpDelta: 0 };
}

export function computeVP(player: PlayerState): number {
  return player.settlements + player.cities * 2;
}

// Roll of 7: players with ≥7 resources discard half; simplest robber
export function handleRobber(players: PlayerState[]): string {
  const msgs: string[] = [];
  for (const p of players) {
    const total = totalResources(p);
    if (total >= 7) {
      let discard = Math.floor(total / 2);
      for (const r of RESOURCES) {
        if (discard <= 0) break;
        const drop = Math.min(p[r], discard);
        p[r] -= drop;
        discard -= drop;
      }
      msgs.push(`${p.name} discards ${Math.floor(total / 2)}`);
    }
  }
  return msgs.length > 0 ? msgs.join(', ') : 'no discards';
}
