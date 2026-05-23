import type { Resource } from './catan';

export type HexTile = {
  index: number;
  resource: Resource | 'desert';
  number: number;
  nodes: [number, number, number, number, number, number];
};

export type BoardNode = {
  id: number;
  adjacentNodes: number[];
  adjacentTiles: number[];
};

// 54 nodes numbered 0-53, sorted top-to-bottom then left-to-right.
// Derived from scaled axial coordinates (X=x*2/√3, Y=y*2) for pointy-top hexes.
// Y levels and their nodes:
//  Y= 2: 0-2   Y= 1: 3-6   Y=-1: 7-10  Y=-2: 11-15  Y=-4: 16-20
//  Y=-5: 21-26 Y=-7: 27-32 Y=-8: 33-37 Y=-10: 38-42 Y=-11: 43-46
//  Y=-13: 47-50 Y=-14: 51-53

// 19 hex tiles: nodes listed clockwise from top (top, tr, br, bottom, bl, tl)
// Standard resource/number distribution: 4 wood, 4 sheep, 4 wheat, 3 ore, 3 brick, 1 desert
export const BOARD_TILES: HexTile[] = [
  // Row 0 (3 hexes)
  { index:  0, resource: 'wood',   number: 11, nodes: [ 0,  4,  8, 12,  7,  3] },
  { index:  1, resource: 'sheep',  number: 12, nodes: [ 1,  5,  9, 13,  8,  4] },
  { index:  2, resource: 'wheat',  number:  9, nodes: [ 2,  6, 10, 14,  9,  5] },
  // Row 1 (4 hexes)
  { index:  3, resource: 'brick',  number:  4, nodes: [ 7, 12, 17, 22, 16, 11] },
  { index:  4, resource: 'ore',    number:  6, nodes: [ 8, 13, 18, 23, 17, 12] },
  { index:  5, resource: 'sheep',  number:  5, nodes: [ 9, 14, 19, 24, 18, 13] },
  { index:  6, resource: 'brick',  number: 10, nodes: [10, 15, 20, 25, 19, 14] },
  // Row 2 (5 hexes)
  { index:  7, resource: 'wheat',  number:  3, nodes: [16, 22, 28, 33, 27, 21] },
  { index:  8, resource: 'ore',    number: 11, nodes: [17, 23, 29, 34, 28, 22] },
  { index:  9, resource: 'desert', number:  0, nodes: [18, 24, 30, 35, 29, 23] },
  { index: 10, resource: 'wood',   number:  4, nodes: [19, 25, 31, 36, 30, 24] },
  { index: 11, resource: 'wheat',  number:  8, nodes: [20, 26, 32, 37, 31, 25] },
  // Row 3 (4 hexes)
  { index: 12, resource: 'ore',    number:  8, nodes: [28, 34, 39, 43, 38, 33] },
  { index: 13, resource: 'wood',   number: 10, nodes: [29, 35, 40, 44, 39, 34] },
  { index: 14, resource: 'sheep',  number:  9, nodes: [30, 36, 41, 45, 40, 35] },
  { index: 15, resource: 'brick',  number:  3, nodes: [31, 37, 42, 46, 41, 36] },
  // Row 4 (3 hexes)
  { index: 16, resource: 'wheat',  number:  5, nodes: [39, 44, 48, 51, 47, 43] },
  { index: 17, resource: 'sheep',  number:  2, nodes: [40, 45, 49, 52, 48, 44] },
  { index: 18, resource: 'wood',   number:  6, nodes: [41, 46, 50, 53, 49, 45] },
];

export function edgeId(a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${String(lo).padStart(2, '0')}${String(hi).padStart(2, '0')}`;
}

export function parseEdge(edge: string): [number, number] {
  return [parseInt(edge.slice(0, 2), 10), parseInt(edge.slice(2, 4), 10)];
}

// Derived constants — built once at module load from BOARD_TILES
export const BOARD_NODES: BoardNode[] = (() => {
  const adjN = new Map<number, Set<number>>();
  const adjT = new Map<number, Set<number>>();
  for (let i = 0; i < 54; i++) { adjN.set(i, new Set()); adjT.set(i, new Set()); }
  for (const tile of BOARD_TILES) {
    const n = tile.nodes;
    for (let i = 0; i < 6; i++) {
      adjT.get(n[i])!.add(tile.index);
      adjN.get(n[i])!.add(n[(i + 1) % 6]);
      adjN.get(n[i])!.add(n[(i + 5) % 6]);
    }
  }
  return Array.from({ length: 54 }, (_, id) => ({
    id,
    adjacentNodes: [...adjN.get(id)!],
    adjacentTiles: [...adjT.get(id)!],
  }));
})();

export const BOARD_EDGES: Set<string> = (() => {
  const s = new Set<string>();
  for (const tile of BOARD_TILES) {
    const n = tile.nodes;
    for (let i = 0; i < 6; i++) s.add(edgeId(n[i], n[(i + 1) % 6]));
  }
  return s;
})();

export function getNodeTiles(nodeId: number): HexTile[] {
  return BOARD_TILES.filter(t => t.nodes.includes(nodeId as never));
}

export function isValidSettlementPlacement(
  nodeId: number,
  allSettlements: number[],
  allCities: number[],
): boolean {
  const occupied = new Set([...allSettlements, ...allCities]);
  if (occupied.has(nodeId)) return false;
  return BOARD_NODES[nodeId].adjacentNodes.every(n => !occupied.has(n));
}

export function isValidRoadPlacement(
  edge: string,
  playerRoads: string[],
  playerSettlements: number[],
  playerCities: number[],
): boolean {
  if (!BOARD_EDGES.has(edge)) return false;
  if (playerRoads.includes(edge)) return false;
  const [a, b] = parseEdge(edge);
  const playerOwnedNodes = new Set([...playerSettlements, ...playerCities]);
  const playerRoadNodes = new Set(
    playerRoads.flatMap(e => parseEdge(e) as number[])
  );
  return [a, b].some(n => playerOwnedNodes.has(n) || playerRoadNodes.has(n));
}

export function getEligibleRobberTiles(currentTile: number): number[] {
  return BOARD_TILES.map(t => t.index).filter(i => i !== currentTile);
}
