import { RESOURCES, canAfford, BUILD_COSTS } from './catan';
import type { Resource, PlayerState, BoardOccupancy } from './catan';
import type { HexTile } from './graph';
import {
  SEA_EDGES, SEA_TRANSIT_EDGES, GOLD_TILE_INDICES, NODE_ISLAND,
  OUTER_NODES, COASTAL_NODES, outerNodeNeighbours,
} from './seafarers-graph';
import { BOARD_NODES, BOARD_EDGES, isValidSettlementPlacement, edgeId } from './graph';

// ── Resource collection ───────────────────────────────────────────────────────

export function pickGoldResource(player: PlayerState): Resource {
  let pick: Resource = 'wood';
  let min = Infinity;
  for (const r of RESOURCES) {
    if (player[r] < min) { min = player[r]; pick = r; }
  }
  return pick;
}

// Returns normal resources gained plus a count of gold tokens to allocate.
export function collectSeafarersResources(
  player: PlayerState,
  diceTotal: number,
  tiles: HexTile[],
  robberTile: number,
  pirateHex: number | null,
): { gained: Partial<Record<Resource, number>>; goldCount: number } {
  const gained: Partial<Record<Resource, number>> = {};
  let goldCount = 0;

  const nodes = [
    ...player.settlementNodes.map(n => ({ n, mult: 1 })),
    ...player.cityNodes.map(n => ({ n, mult: 2 })),
  ];

  for (const { n, mult } of nodes) {
    for (const tile of tiles) {
      if (tile.number !== diceTotal) continue;
      if (tile.index === robberTile) continue;
      if (pirateHex !== null && tile.index === pirateHex) continue;
      if (tile.resource === 'desert') continue;
      if (!(tile.nodes as unknown as number[]).includes(n)) continue;
      if (GOLD_TILE_INDICES.has(tile.index)) {
        goldCount += mult;
      } else {
        gained[tile.resource as Resource] = (gained[tile.resource as Resource] ?? 0) + mult;
      }
    }
  }
  return { gained, goldCount };
}

// ── Ship placement ────────────────────────────────────────────────────────────

export function isValidShipPlacement(
  edge: string,
  allShips: string[],
  playerShips: string[],
  playerSettlements: number[],
  playerCities: number[],
  playerRoads: string[],
): boolean {
  if (!SEA_EDGES.has(edge)) return false;
  if (allShips.includes(edge)) return false;

  const a = parseInt(edge.slice(0, 2), 10);
  const b = parseInt(edge.slice(2, 4), 10);

  const shipEndpoints = new Set<number>(
    playerShips.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
  );
  const ownedNodes = new Set<number>([...playerSettlements, ...playerCities]);
  const roadEndpoints = new Set<number>(
    playerRoads.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
  );

  // A node qualifies as a ship-route anchor if:
  // • the player owns a settlement/city there and it's a coastal or outer-island node, OR
  // • it's already an endpoint of one of the player's ships, OR
  // • it's a road endpoint on a coastal main-island node (roads connect to ships at coast).
  function isAnchor(node: number): boolean {
    if (ownedNodes.has(node) && (COASTAL_NODES.has(node) || OUTER_NODES.has(node))) return true;
    if (shipEndpoints.has(node)) return true;
    if (roadEndpoints.has(node) && COASTAL_NODES.has(node)) return true;
    return false;
  }

  return isAnchor(a) || isAnchor(b);
}

// ── Extra seafarers actions (ships + outer-island settlements) ────────────────

export function getSeafarersExtraActions(
  player: PlayerState,
  allPlayers: PlayerState[],
  occupancy: BoardOccupancy,
): string[] {
  const extra: string[] = [];
  const allShips = allPlayers.flatMap(p => p.shipEdges);
  const allOccupied = [...occupancy.settlements, ...occupancy.cities];

  // Build ship
  if (canAfford(player, { wood: 1, sheep: 1 })) {
    for (const edge of SEA_EDGES) {
      if (isValidShipPlacement(
        edge, allShips, player.shipEdges,
        player.settlementNodes, player.cityNodes, player.roadEdges,
      )) {
        extra.push(`build_ship:${edge}`);
      }
    }
  }

  // Build settlement on outer island (reachable via ships)
  if (canAfford(player, BUILD_COSTS.settlement) && player.shipEdges.length > 0) {
    const shipEndpoints = new Set<number>(
      player.shipEdges.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
    );
    for (const nodeId of shipEndpoints) {
      if (!OUTER_NODES.has(nodeId)) continue;
      if (allOccupied.includes(nodeId)) continue;
      const [n1, n2] = outerNodeNeighbours(nodeId);
      if (allOccupied.includes(n1) || allOccupied.includes(n2)) continue;
      extra.push(`build_settlement:${String(nodeId).padStart(2, '0')}`);
    }
  }

  return extra;
}

// ── Initial placement (seafarers) ────────────────────────────────────────────
// Like base Catan but prefers coastal nodes and grants 1 free starting ship.

export function createSeafarersInitialPlacement(
  takenNodes: number[],
  takenEdges: string[],
  takenShips: string[],
): { settlementNodes: number[]; cityNodes: number[]; roadEdges: string[]; shipEdges: string[] } {
  // Prefer coastal nodes so players can start building ships immediately.
  const coastalFirst = [
    ...[...COASTAL_NODES].sort(() => Math.random() - 0.5),
    ...Array.from({ length: 54 }, (_, i) => i).filter(n => !COASTAL_NODES.has(n)).sort(() => Math.random() - 0.5),
  ];

  const localTaken = [...takenNodes];
  const localTakenEdges = [...takenEdges];
  const localTakenShips = [...takenShips];
  const settlementNodes: number[] = [];
  const roadEdges: string[] = [];
  const shipEdges: string[] = [];

  for (const nodeId of coastalFirst) {
    if (settlementNodes.length >= 2) break;
    if (!isValidSettlementPlacement(nodeId, localTaken, [])) continue;

    settlementNodes.push(nodeId);
    localTaken.push(nodeId);

    if (COASTAL_NODES.has(nodeId)) {
      // Try to place a free starting ship on a transit edge from this node.
      const transitFromHere = SEA_TRANSIT_EDGES.filter(e => {
        const a = parseInt(e.slice(0, 2), 10);
        const b = parseInt(e.slice(2, 4), 10);
        return (a === nodeId || b === nodeId) && !localTakenShips.includes(e);
      });
      if (transitFromHere.length > 0) {
        const ship = transitFromHere[Math.floor(Math.random() * transitFromHere.length)];
        shipEdges.push(ship);
        localTakenShips.push(ship);
        continue; // no road needed — ship is the connection from this settlement
      }
    }

    // Fallback: place a land road
    const adjEdges = BOARD_NODES[nodeId].adjacentNodes
      .map(adj => edgeId(nodeId, adj))
      .filter(e => BOARD_EDGES.has(e) && !localTakenEdges.includes(e));
    if (adjEdges.length > 0) {
      const road = adjEdges[Math.floor(Math.random() * adjEdges.length)];
      roadEdges.push(road);
      localTakenEdges.push(road);
    }
  }

  return { settlementNodes, cityNodes: [], roadEdges, shipEdges };
}

// ── Exploration VP ────────────────────────────────────────────────────────────

// Returns the island id (1-3) if this settlement earns exploration VP, or 0.
export function checkExplorationVP(nodeId: number, existingSettlements: number[]): number {
  const islandId = NODE_ISLAND[nodeId] ?? 0;
  if (islandId === 0) return 0;
  const alreadyThere = existingSettlements.some(n => (NODE_ISLAND[n] ?? 0) === islandId);
  return alreadyThere ? 0 : islandId;
}
