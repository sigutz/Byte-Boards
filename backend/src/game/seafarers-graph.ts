import { BOARD_TILES, BOARD_NODES } from './graph';
import type { HexTile, BoardNode } from './graph';

// Three outer island tiles reachable only by ship (tile indices 19-21).
// Nodes 54-59 = island A (sheep), 60-65 = island B (wheat), 66-71 = gold field.
// Outer island nodes are arranged as a pointy-top hex ring: [top, TR, BR, bottom, BL, TL].
export const OUTER_TILES: HexTile[] = [
  { index: 19, resource: 'sheep', number: 5, nodes: [54, 55, 56, 57, 58, 59] },
  { index: 20, resource: 'wheat', number: 4, nodes: [60, 61, 62, 63, 64, 65] },
  { index: 21, resource: 'wheat', number: 6, nodes: [66, 67, 68, 69, 70, 71] }, // gold — resource chosen at runtime
];

export const SEA_ALL_TILES: HexTile[] = [...BOARD_TILES, ...OUTER_TILES];

// Tile 21 is the gold field: player picks any resource when it produces.
export const GOLD_TILE_INDICES = new Set<number>([21]);

// Which outer island (1-3) a node belongs to. Main island nodes are absent (implicitly 0).
export const NODE_ISLAND: Record<number, number> = {};
for (const n of [54, 55, 56, 57, 58, 59]) NODE_ISLAND[n] = 1;
for (const n of [60, 61, 62, 63, 64, 65]) NODE_ISLAND[n] = 2;
for (const n of [66, 67, 68, 69, 70, 71]) NODE_ISLAND[n] = 3;

export const OUTER_NODES = new Set<number>([54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);

// ── Sea edges ─────────────────────────────────────────────────────────────────
// Transit edges: connect coastal main-island nodes to outer island entry nodes.
// Covers the entire top and right perimeter so any starting position can
// reach outer islands within a few ships.
//
// Main island right-side perimeter (top → bottom):
//   top: 0,1,2,3,4,5,6  upper-right: 10,15  right: 20,26,32,37  lower-right: 42,46,50,53
export const SEA_TRANSIT_EDGES: string[] = [
  // Top coastal nodes → Island A (sheep, number 5)
  '0054', '0154', '0254',
  '0355', '0455', '0555', '0655',

  // Upper-right → Island B (wheat, number 4)
  '1060', '1561', '2062', '2063',

  // Right/lower-right → Gold island (number 6)
  '2666', '3267', '3768',
  '4269', '4670', '5071', '5371',

  // Inter-island connections (route from A → B → gold)
  '5760', '5963',  // island A → island B
  '6366',          // island B → gold island
];

// Within-island edges: ships (and eventually roads) can navigate inside each outer island.
export const OUTER_ISLAND_EDGES: string[] = [
  '5455', '5556', '5657', '5758', '5859', '5459',  // island A ring
  '6061', '6162', '6263', '6364', '6465', '6065',  // island B ring
  '6667', '6768', '6869', '6970', '7071', '6671',  // gold island ring
];

export const SEA_EDGES = new Set<string>([...SEA_TRANSIT_EDGES, ...OUTER_ISLAND_EDGES]);

// ── Coastal nodes ─────────────────────────────────────────────────────────────
// Main-island nodes that touch fewer than 3 land tiles — eligible to start ship routes.
const _tileCnt = new Array(54).fill(0);
for (const tile of BOARD_TILES) {
  for (const n of tile.nodes) _tileCnt[n]++;
}
export const COASTAL_NODES = new Set<number>(
  _tileCnt.reduce<number[]>((acc, c, i) => { if (c < 3) acc.push(i); return acc; }, [])
);

// ── Extended board nodes (54-71) ─────────────────────────────────────────────
const _outerAdj = new Map<number, Set<number>>();
for (const tile of OUTER_TILES) {
  const ns = tile.nodes as unknown as number[];
  for (let i = 0; i < 6; i++) {
    if (!_outerAdj.has(ns[i])) _outerAdj.set(ns[i], new Set());
    _outerAdj.get(ns[i])!.add(ns[(i + 1) % 6]);
    _outerAdj.get(ns[i])!.add(ns[(i + 5) % 6]);
  }
}

export const SEAFARERS_BOARD_NODES: BoardNode[] = [
  ...BOARD_NODES,
  ...Array.from({ length: 18 }, (_, i) => {
    const id = 54 + i;
    return {
      id,
      adjacentNodes: [...(_outerAdj.get(id) ?? new Set<number>())],
      adjacentTiles: OUTER_TILES.filter(t => (t.nodes as unknown as number[]).includes(id)).map(t => t.index),
    };
  }),
];

// Two ring-neighbours of an outer island node (for settlement distance check).
export function outerNodeNeighbours(nodeId: number): [number, number] {
  const base = nodeId < 60 ? 54 : nodeId < 66 ? 60 : 66;
  const off = nodeId - base;
  return [base + (off + 1) % 6, base + (off + 5) % 6];
}

// Outer island tile indices (pirate eligible).
export const OUTER_TILE_INDICES: number[] = [19, 20, 21];
