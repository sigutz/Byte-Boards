import { useState, useEffect } from 'react';
import type { Standing } from '../types';
import { PLAYER_COLORS } from '../types';

// ── Board geometry ────────────────────────────────────────────────────────────
const R = 44;
const SQRT3 = Math.sqrt(3);
const PAD = 38;
const TILE_W = R * SQRT3;
const BOARD_W = Math.round(5 * TILE_W + PAD * 2);
const BOARD_H = Math.round(8 * R + PAD * 2);

// Expanded canvas for Seafarers (outer islands sit to the right)
const SEA_W = 668;
const SEA_H = 468;

// ── Main island data (matches backend graph.ts) ───────────────────────────────
type TileData = { index: number; resource: string; number: number; nodes: [number,number,number,number,number,number] };
const BOARD_TILES: TileData[] = [
  { index:  0, resource: 'wood',   number: 11, nodes: [ 0,  4,  8, 12,  7,  3] },
  { index:  1, resource: 'sheep',  number: 12, nodes: [ 1,  5,  9, 13,  8,  4] },
  { index:  2, resource: 'wheat',  number:  9, nodes: [ 2,  6, 10, 14,  9,  5] },
  { index:  3, resource: 'brick',  number:  4, nodes: [ 7, 12, 17, 22, 16, 11] },
  { index:  4, resource: 'ore',    number:  6, nodes: [ 8, 13, 18, 23, 17, 12] },
  { index:  5, resource: 'sheep',  number:  5, nodes: [ 9, 14, 19, 24, 18, 13] },
  { index:  6, resource: 'brick',  number: 10, nodes: [10, 15, 20, 25, 19, 14] },
  { index:  7, resource: 'wheat',  number:  3, nodes: [16, 22, 28, 33, 27, 21] },
  { index:  8, resource: 'ore',    number: 11, nodes: [17, 23, 29, 34, 28, 22] },
  { index:  9, resource: 'desert', number:  0, nodes: [18, 24, 30, 35, 29, 23] },
  { index: 10, resource: 'wood',   number:  4, nodes: [19, 25, 31, 36, 30, 24] },
  { index: 11, resource: 'wheat',  number:  8, nodes: [20, 26, 32, 37, 31, 25] },
  { index: 12, resource: 'ore',    number:  8, nodes: [28, 34, 39, 43, 38, 33] },
  { index: 13, resource: 'wood',   number: 10, nodes: [29, 35, 40, 44, 39, 34] },
  { index: 14, resource: 'sheep',  number:  9, nodes: [30, 36, 41, 45, 40, 35] },
  { index: 15, resource: 'brick',  number:  3, nodes: [31, 37, 42, 46, 41, 36] },
  { index: 16, resource: 'wheat',  number:  5, nodes: [39, 44, 48, 51, 47, 43] },
  { index: 17, resource: 'sheep',  number:  2, nodes: [40, 45, 49, 52, 48, 44] },
  { index: 18, resource: 'wood',   number:  6, nodes: [41, 46, 50, 53, 49, 45] },
];

// ── Outer island tiles (matches backend seafarers-graph.ts) ───────────────────
type OuterTileData = { index: number; resource: string; number: number; nodes: readonly number[] };
const OUTER_TILES: OuterTileData[] = [
  { index: 19, resource: 'sheep', number: 5, nodes: [54, 55, 56, 57, 58, 59] },
  { index: 20, resource: 'wheat', number: 4, nodes: [60, 61, 62, 63, 64, 65] },
  { index: 21, resource: 'gold',  number: 6, nodes: [66, 67, 68, 69, 70, 71] },
];

// Outer tile centers chosen to sit in the sea to the right of the main island
const OUTER_CENTERS: Record<number, [number, number]> = {
  19: [508, 72],
  20: [592, 200],
  21: [562, 360],
};

const OUTER_NODE_POS: Record<number, [number, number]> = (() => {
  const pos: Record<number, [number, number]> = {};
  for (const t of OUTER_TILES) {
    const [cx, cy] = OUTER_CENTERS[t.index];
    const ns = t.nodes as number[];
    pos[ns[0]] = [cx, cy - R];
    pos[ns[1]] = [cx + TILE_W / 2, cy - R / 2];
    pos[ns[2]] = [cx + TILE_W / 2, cy + R / 2];
    pos[ns[3]] = [cx, cy + R];
    pos[ns[4]] = [cx - TILE_W / 2, cy + R / 2];
    pos[ns[5]] = [cx - TILE_W / 2, cy - R / 2];
  }
  return pos;
})();

function anyNodePos(nodeId: number): [number, number] | null {
  if (nodeId < 54) return NODE_POS[nodeId] ?? null;
  return OUTER_NODE_POS[nodeId] ?? null;
}

// ── Ports ─────────────────────────────────────────────────────────────────────
type PortType = 'ore' | 'wheat' | 'wood' | 'sheep' | 'brick' | '3:1';
type PortData = { type: PortType; nodes: [number, number] };
const PORTS: PortData[] = [
  { type: '3:1',   nodes: [0,  3]  },
  { type: 'ore',   nodes: [1,  4]  },
  { type: '3:1',   nodes: [2,  6]  },
  { type: 'wheat', nodes: [6,  10] },
  { type: '3:1',   nodes: [20, 26] },
  { type: 'sheep', nodes: [32, 37] },
  { type: 'brick', nodes: [50, 53] },
  { type: '3:1',   nodes: [43, 47] },
  { type: 'wood',  nodes: [21, 27] },
];

const PORT_ICON: Record<PortType, string> = {
  ore: '⛏️', wheat: '🌾', wood: '🌲', sheep: '🐑', brick: '🧱', '3:1': '🔀',
};
const PORT_COLOR: Record<PortType, string> = {
  ore: '#9ca3af', wheat: '#eab308', wood: '#22c55e',
  sheep: '#86efac', brick: '#f97316', '3:1': '#60a5fa',
};

const RESOURCE_COLORS: Record<string, string> = {
  wood:   '#2d6e1f',
  sheep:  '#6abf3e',
  wheat:  '#e6bb28',
  ore:    '#6b7280',
  brick:  '#b85c3a',
  desert: '#c9a84c',
  gold:   '#a87c1a',
};

const RESOURCE_ICON: Record<string, string> = {
  wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️', brick: '🧱', desert: '🏜️', gold: '⭐',
};

const PROB_DOTS: Record<number, number> = { 2:1, 3:2, 4:3, 5:4, 6:5, 8:5, 9:4, 10:3, 11:2, 12:1 };

// ── Tile centers ──────────────────────────────────────────────────────────────
const TILE_CENTERS: [number, number][] = (() => {
  const cx = BOARD_W / 2;
  const centers: [number, number][] = new Array(19);
  const rows: [number, number][] = [[3, 0], [4, 3], [5, 7], [4, 12], [3, 16]];
  let y = PAD + R;
  for (const [count, start] of rows) {
    const sx = cx - ((count - 1) / 2) * TILE_W;
    for (let i = 0; i < count; i++) centers[start + i] = [sx + i * TILE_W, y];
    y += R * 1.5;
  }
  return centers;
})();

// ── Node positions ────────────────────────────────────────────────────────────
const VERTEX_OFFSETS: [number, number][] = [
  [0,              -R      ],
  [TILE_W / 2,    -R / 2  ],
  [TILE_W / 2,     R / 2  ],
  [0,               R      ],
  [-TILE_W / 2,    R / 2  ],
  [-TILE_W / 2,   -R / 2  ],
];

const NODE_POS: [number, number][] = (() => {
  const pos: ([number, number] | null)[] = new Array(54).fill(null);
  for (const t of BOARD_TILES) {
    const [tcx, tcy] = TILE_CENTERS[t.index];
    for (let v = 0; v < 6; v++) {
      const n = t.nodes[v];
      if (!pos[n]) pos[n] = [tcx + VERTEX_OFFSETS[v][0], tcy + VERTEX_OFFSETS[v][1]];
    }
  }
  return pos as [number, number][];
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 2 - i * Math.PI / 3;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function parseEdge(edge: string): [number, number] {
  return [parseInt(edge.slice(0, 2), 10), parseInt(edge.slice(2, 4), 10)];
}

function useImageExists(src: string): boolean {
  const [exists, setExists] = useState(false);
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setExists(true);
    img.onerror = () => setExists(false);
    img.src = src;
  }, [src]);
  return exists;
}

// ── HexTile (main island) ─────────────────────────────────────────────────────
function HexTile({ tile, isRobber }: { tile: TileData; isRobber: boolean }) {
  const [cx, cy] = TILE_CENTERS[tile.index];
  const imgSrc = `/img/${tile.resource}.jpg`;
  const imgExists = useImageExists(imgSrc);
  const color = RESOURCE_COLORS[tile.resource] ?? '#888';
  const dots = PROB_DOTS[tile.number] ?? 0;
  const isHot = tile.number === 6 || tile.number === 8;

  return (
    <g>
      <polygon points={hexPoints(cx, cy, R - 1)} fill={color}
        stroke={isRobber ? '#6d28d9' : '#0a1218'} strokeWidth={2} />
      {imgExists && (
        <clipPath id={`hex-clip-${tile.index}`}>
          <polygon points={hexPoints(cx, cy, R - 2)} />
        </clipPath>
      )}
      {imgExists && (
        <image href={imgSrc} x={cx - R + 1} y={cy - R + 1}
          width={(R - 1) * 2} height={(R - 1) * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#hex-clip-${tile.index})`} opacity={0.85} />
      )}
      {!imgExists && tile.resource !== 'desert' && (
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={16}
          style={{ userSelect: 'none' }}>{RESOURCE_ICON[tile.resource]}</text>
      )}
      {!imgExists && tile.resource === 'desert' && (
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={18}
          style={{ userSelect: 'none' }}>🏜️</text>
      )}
      {tile.number > 0 && !isRobber && (
        <g>
          <circle cx={cx} cy={cy + 10} r={14} fill="#000" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central"
            fontSize={11} fontWeight={700} fill={isHot ? '#ef4444' : '#ffffff'}>{tile.number}</text>
          <text x={cx} y={cy + 23} textAnchor="middle" fontSize={6}
            fill={isHot ? '#ef4444' : 'rgba(255,255,255,0.5)'} letterSpacing={1}>
            {'•'.repeat(dots)}
          </text>
        </g>
      )}
      {isRobber && (
        <g>
          <circle cx={cx} cy={cy} r={20} fill="rgba(0,0,0,0.65)" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={22} style={{ userSelect: 'none' }}>🥷</text>
        </g>
      )}
    </g>
  );
}

// ── OuterHexTile (seafarers outer island) ─────────────────────────────────────
function OuterHexTile({ tile, isPirate }: { tile: OuterTileData; isPirate: boolean }) {
  const [cx, cy] = OUTER_CENTERS[tile.index];
  const isGold = tile.index === 21;
  const dots = PROB_DOTS[tile.number] ?? 0;
  const isHot = tile.number === 6 || tile.number === 8;
  const color = RESOURCE_COLORS[tile.resource] ?? '#888';
  const icon = RESOURCE_ICON[tile.resource];
  const islandNum = tile.index - 18;

  return (
    <g>
      {/* Sea glow */}
      <circle cx={cx} cy={cy} r={R + 14} fill="rgba(6,182,212,0.07)" />
      <polygon points={hexPoints(cx, cy, R - 1)} fill={color}
        stroke={isPirate ? '#7c3aed' : '#22d3ee'} strokeWidth={isPirate ? 2.5 : 1.5} />
      {!isPirate && (
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={16}
          style={{ userSelect: 'none' }}>{icon}</text>
      )}
      {isGold && !isPirate && (
        <text x={cx} y={cy - 28} textAnchor="middle" fontSize={7} fontWeight={700}
          fill="#fbbf24" letterSpacing={0.5}>GOLD FIELD</text>
      )}
      {tile.number > 0 && !isPirate && (
        <g>
          <circle cx={cx} cy={cy + 10} r={14} fill="#000" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central"
            fontSize={11} fontWeight={700} fill={isHot ? '#ef4444' : '#ffffff'}>{tile.number}</text>
          <text x={cx} y={cy + 23} textAnchor="middle" fontSize={6}
            fill={isHot ? '#ef4444' : 'rgba(255,255,255,0.5)'} letterSpacing={1}>
            {'•'.repeat(dots)}
          </text>
        </g>
      )}
      {/* Pirate overlay */}
      {isPirate && (
        <g>
          <circle cx={cx} cy={cy} r={20} fill="rgba(0,0,0,0.65)" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={20} style={{ userSelect: 'none' }}>🏴‍☠️</text>
        </g>
      )}
      {/* Exploration VP label */}
      <text x={cx} y={cy + R + 14} textAnchor="middle" fontSize={7} fill="#22d3ee" opacity={0.7}>
        Island {islandNum} · +1VP first settle
      </text>
    </g>
  );
}

// ── HouseIcon ─────────────────────────────────────────────────────────────────
function HouseIcon({ nx, ny, color, city }: { nx: number; ny: number; color: string; city?: boolean }) {
  const size = city ? 13 : 9;
  if (city) {
    return (
      <g>
        <rect x={nx - size} y={ny - size} width={size * 2} height={size * 2}
          fill={color} stroke="#0d1827" strokeWidth={1.5} rx={2} />
        <rect x={nx - size * 0.4} y={ny - size - 5} width={size * 0.8} height={7}
          fill={color} stroke="#0d1827" strokeWidth={1} rx={1} />
      </g>
    );
  }
  const hw = size;
  const hh = size;
  return (
    <g>
      <rect x={nx - hw} y={ny - hh / 2} width={hw * 2} height={hh}
        fill={color} stroke="#0d1827" strokeWidth={1.5} rx={1} />
      <polygon points={`${nx - hw},${ny - hh / 2} ${nx},${ny - hh / 2 - hw * 0.8} ${nx + hw},${ny - hh / 2}`}
        fill={color} stroke="#0d1827" strokeWidth={1.5} />
    </g>
  );
}

// ── Road ──────────────────────────────────────────────────────────────────────
function Road({ edge, color }: { edge: string; color: string }) {
  const [a, b] = parseEdge(edge);
  const [ax, ay] = NODE_POS[a];
  const [bx, by] = NODE_POS[b];
  return <line x1={ax} y1={ay} x2={bx} y2={by}
    stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.9} />;
}

// ── Ship (sea edge — dashed, can span main island ↔ outer island nodes) ───────
function Ship({ edge, color }: { edge: string; color: string }) {
  const [a, b] = parseEdge(edge);
  const pa = anyNodePos(a);
  const pb = anyNodePos(b);
  if (!pa || !pb) return null;
  return (
    <line x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]}
      stroke={color} strokeWidth={4} strokeLinecap="round"
      strokeDasharray="7,4" opacity={0.85} />
  );
}

// ── Port ──────────────────────────────────────────────────────────────────────
function Port({ port }: { port: PortData }) {
  const [x1, y1] = NODE_POS[port.nodes[0]];
  const [x2, y2] = NODE_POS[port.nodes[1]];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const bx = BOARD_W / 2;
  const by = BOARD_H / 2;
  const dx = mx - bx;
  const dy = my - by;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = mx + (dx / len) * 20;
  const py = my + (dy / len) * 20;
  const col = PORT_COLOR[port.type];

  return (
    <g>
      <line x1={px} y1={py} x2={x1} y2={y1}
        stroke={col} strokeWidth={1.2} strokeDasharray="3,2" opacity={0.6} />
      <line x1={px} y1={py} x2={x2} y2={y2}
        stroke={col} strokeWidth={1.2} strokeDasharray="3,2" opacity={0.6} />
      <circle cx={px} cy={py} r={13} fill="#050e1c" stroke={col} strokeWidth={1.5} />
      <text x={px} y={py - 2} textAnchor="middle" dominantBaseline="middle"
        fontSize={9} style={{ userSelect: 'none' }}>{PORT_ICON[port.type]}</text>
      <text x={px} y={py + 8} textAnchor="middle"
        fontSize={6} fontWeight={700} fill={col} letterSpacing={0.5}>
        {port.type === '3:1' ? '3:1' : '2:1'}
      </text>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  standings: Standing[];
  robberTile?: number;
  pirateHex?: number | null;
  isSeafarers?: boolean;
}

export default function CatanBoard({ standings, robberTile = 9, pirateHex = null, isSeafarers = false }: Props) {
  const svgW = isSeafarers ? SEA_W : BOARD_W;
  const svgH = isSeafarers ? SEA_H : BOARD_H;

  return (
    <div style={{
      display: 'inline-block',
      border: `2px solid ${isSeafarers ? '#0e3a50' : '#1e3a5f'}`,
      borderRadius: 14,
      boxShadow: isSeafarers
        ? '0 0 0 1px rgba(6,182,212,0.08), 0 4px 24px rgba(0,0,0,0.5)'
        : '0 0 0 1px rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      <svg width={svgW} height={svgH} style={{ display: 'block', background: '#071525' }}>
        <rect width={svgW} height={svgH} fill="#071525" />

        {/* Seafarers: subtle ocean shimmer in the expanded area */}
        {isSeafarers && (
          <>
            <rect x={BOARD_W - 20} y={0} width={SEA_W - BOARD_W + 20} height={SEA_H}
              fill="rgba(6,182,212,0.025)" />
            <line x1={BOARD_W - 20} y1={0} x2={BOARD_W - 20} y2={SEA_H}
              stroke="rgba(6,182,212,0.08)" strokeWidth={1} strokeDasharray="6,4" />
          </>
        )}

        {/* Ports */}
        {PORTS.map((p, i) => <Port key={i} port={p} />)}

        {/* Outer island tiles (behind main tiles so they don't overlap) */}
        {isSeafarers && OUTER_TILES.map(tile => (
          <OuterHexTile key={tile.index} tile={tile} isPirate={tile.index === pirateHex} />
        ))}

        {/* Main island tiles */}
        {BOARD_TILES.map(tile => (
          <HexTile key={tile.index} tile={tile} isRobber={tile.index === robberTile} />
        ))}

        {/* Roads (main island only) */}
        {standings.map((s, si) => {
          const color = PLAYER_COLORS[((s.seat ?? (si + 1)) - 1) % PLAYER_COLORS.length].hex;
          return (s.roadEdges ?? []).map(edge => (
            <Road key={`r-${si}-${edge}`} edge={edge} color={color} />
          ));
        })}

        {/* Ships (sea edges — can span main island ↔ outer islands) */}
        {isSeafarers && standings.map((s, si) => {
          const color = PLAYER_COLORS[((s.seat ?? (si + 1)) - 1) % PLAYER_COLORS.length].hex;
          return (s.shipEdges ?? []).map(edge => (
            <Ship key={`sh-${si}-${edge}`} edge={edge} color={color} />
          ));
        })}

        {/* Settlements */}
        {standings.map((s, si) => {
          const color = PLAYER_COLORS[((s.seat ?? (si + 1)) - 1) % PLAYER_COLORS.length].hex;
          return (s.settlementNodes ?? []).map(n => {
            const pos = isSeafarers ? anyNodePos(n) : NODE_POS[n];
            if (!pos) return null;
            const [nx, ny] = pos;
            return <HouseIcon key={`s-${si}-${n}`} nx={nx} ny={ny} color={color} />;
          });
        })}

        {/* Cities */}
        {standings.map((s, si) => {
          const color = PLAYER_COLORS[((s.seat ?? (si + 1)) - 1) % PLAYER_COLORS.length].hex;
          return (s.cityNodes ?? []).map(n => {
            const pos = isSeafarers ? anyNodePos(n) : NODE_POS[n];
            if (!pos) return null;
            const [nx, ny] = pos;
            return <HouseIcon key={`c-${si}-${n}`} nx={nx} ny={ny} color={color} city />;
          });
        })}
      </svg>
    </div>
  );
}
