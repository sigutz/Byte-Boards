import {
  BOARD_EDGES, BOARD_NODES, BOARD_TILES,
  edgeId, getNodeTiles,
  isValidSettlementPlacement, isValidRoadPlacement,
} from './graph';
import type { HexTile } from './graph';

export type Resource = 'wood' | 'brick' | 'ore' | 'wheat' | 'sheep';
export const RESOURCES: Resource[] = ['wood', 'brick', 'ore', 'wheat', 'sheep'];

export type PlayerState = {
  agentId: number;
  name: string;
  wood: number;
  brick: number;
  ore: number;
  wheat: number;
  sheep: number;
  settlementNodes: number[];
  cityNodes: number[];
  roadEdges: string[];
};

export type BoardOccupancy = {
  settlements: number[];
  cities: number[];
  roads: string[];
};

export const BUILD_COSTS: Record<string, Partial<Record<Resource, number>>> = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city:       { wheat: 2, ore: 3 },
  dev_card:   { ore: 1, wheat: 1, sheep: 1 },
};

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rollDice(): [number, number] {
  return [randomInt(1, 6), randomInt(1, 6)];
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

export function computeVP(player: PlayerState): number {
  return player.settlementNodes.length + player.cityNodes.length * 2;
}

export function collectResources(
  player: PlayerState,
  diceTotal: number,
  boardTiles: HexTile[],
): Partial<Record<Resource, number>> {
  const gained: Partial<Record<Resource, number>> = {};
  for (const nodeId of player.settlementNodes) {
    for (const tile of boardTiles) {
      if (tile.number === diceTotal && tile.resource !== 'desert' && tile.nodes.includes(nodeId as never)) {
        gained[tile.resource as Resource] = (gained[tile.resource as Resource] ?? 0) + 1;
      }
    }
  }
  for (const nodeId of player.cityNodes) {
    for (const tile of boardTiles) {
      if (tile.number === diceTotal && tile.resource !== 'desert' && tile.nodes.includes(nodeId as never)) {
        gained[tile.resource as Resource] = (gained[tile.resource as Resource] ?? 0) + 2;
      }
    }
  }
  return gained;
}

export function getValidActions(
  player: PlayerState,
  _allPlayers: PlayerState[],
  occupancy: BoardOccupancy,
): string[] {
  const valid: string[] = ['pass'];

  // Roads: edges adjacent to player's network not already occupied
  if (canAfford(player, BUILD_COSTS.road)) {
    const playerNodes = new Set([...player.settlementNodes, ...player.cityNodes]);
    const playerRoadNodes = new Set(
      player.roadEdges.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
    );
    const candidateNodes = new Set([...playerNodes, ...playerRoadNodes]);
    const checkedEdges = new Set<string>();
    for (const nodeId of candidateNodes) {
      for (const adjNode of BOARD_NODES[nodeId].adjacentNodes) {
        const edge = edgeId(nodeId, adjNode);
        if (checkedEdges.has(edge)) continue;
        checkedEdges.add(edge);
        if (isValidRoadPlacement(edge, occupancy.roads, player.settlementNodes, player.cityNodes)) {
          valid.push(`build_road:${edge}`);
        }
      }
    }
  }

  // Settlements: road endpoints that pass the distance rule
  if (canAfford(player, BUILD_COSTS.settlement) && player.roadEdges.length > 0) {
    const roadEndpoints = new Set(
      player.roadEdges.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
    );
    for (const nodeId of roadEndpoints) {
      if (isValidSettlementPlacement(nodeId, occupancy.settlements, occupancy.cities)) {
        valid.push(`build_settlement:${String(nodeId).padStart(2, '0')}`);
      }
    }
  }

  // Cities: upgrade any existing settlement
  if (canAfford(player, BUILD_COSTS.city)) {
    for (const nodeId of player.settlementNodes) {
      valid.push(`build_city:${String(nodeId).padStart(2, '0')}`);
    }
  }

  // Dev card
  if (canAfford(player, BUILD_COSTS.dev_card)) valid.push('buy_dev_card');

  // 4:1 bank trades
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
  if (action.startsWith('build_road:')) {
    const edge = action.slice('build_road:'.length);
    player.wood -= 1; player.brick -= 1;
    player.roadEdges.push(edge);
    return { text: `builds a road on ${edge}`, vpDelta: 0 };
  }
  if (action.startsWith('build_settlement:')) {
    const nodeId = parseInt(action.slice('build_settlement:'.length), 10);
    player.wood -= 1; player.brick -= 1; player.wheat -= 1; player.sheep -= 1;
    player.settlementNodes.push(nodeId);
    return { text: `builds a settlement at node ${nodeId} (+1 VP)`, vpDelta: 1 };
  }
  if (action.startsWith('build_city:')) {
    const nodeId = parseInt(action.slice('build_city:'.length), 10);
    player.wheat -= 2; player.ore -= 3;
    const idx = player.settlementNodes.indexOf(nodeId);
    if (idx !== -1) player.settlementNodes.splice(idx, 1);
    player.cityNodes.push(nodeId);
    return { text: `upgrades node ${nodeId} to a city (+1 VP)`, vpDelta: 1 };
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

// Roll of 7: players with ≥7 resources discard half
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

export function createInitialPlacement(
  takenNodes: number[],
  takenEdges: string[],
): { settlementNodes: number[]; cityNodes: number[]; roadEdges: string[] } {
  // Shuffle all node IDs
  const allNodes = Array.from({ length: 54 }, (_, i) => i)
    .sort(() => Math.random() - 0.5);

  const localTaken = [...takenNodes];
  const localTakenEdges = [...takenEdges];
  const settlementNodes: number[] = [];
  const roadEdges: string[] = [];

  for (const nodeId of allNodes) {
    if (settlementNodes.length >= 2) break;
    if (isValidSettlementPlacement(nodeId, localTaken, [])) {
      settlementNodes.push(nodeId);
      localTaken.push(nodeId);

      // Pick a random adjacent edge for this settlement
      const adjEdges = BOARD_NODES[nodeId].adjacentNodes
        .map(adj => edgeId(nodeId, adj))
        .filter(e => BOARD_EDGES.has(e) && !localTakenEdges.includes(e));

      if (adjEdges.length > 0) {
        const road = adjEdges[Math.floor(Math.random() * adjEdges.length)];
        roadEdges.push(road);
        localTakenEdges.push(road);
      }
    }
  }

  return { settlementNodes, cityNodes: [], roadEdges };
}

// Re-export graph helpers consumed by index.ts
export { BOARD_TILES, BOARD_NODES } from './graph';
