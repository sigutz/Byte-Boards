import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, MatchStatus, EventType, Role, MatchVisibility } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { PlayerState, BoardOccupancy, DevCardType, DevCardCounts, Resource } from './game/catan';
import {
  createInitialPlacement, rollDice, collectResources,
  applyAction, computeVP, handleRobber, totalResources,
  BOARD_TILES, RESOURCES, EMPTY_DEV_CARDS, shuffleDeck, getValidRoadEdges, computeLongestRoad,
} from './game/catan';
import { getAgentDecision } from './game/ai';
import { callGemini, hasGeminiKey } from './game/gemini-client';
import type { RobberPayload, KnightPayload, SeafarersContext } from './game/ai';
import { BOARD_NODES, getEligibleRobberTiles } from './game/graph';
import { ALL_TRAITS, TRAIT_DESCRIPTIONS, TRAIT_CONFLICTS, validateTraits } from './game/personality';
import type { Trait } from './game/personality';
import {
  SEA_ALL_TILES, OUTER_TILE_INDICES, OUTER_NODES,
} from './game/seafarers-graph';
import {
  collectSeafarersResources, getSeafarersExtraActions,
  pickGoldResource, checkExplorationVP, createSeafarersInitialPlacement,
} from './game/seafarers';

const JWT_SECRET = process.env.JWT_SECRET ?? 'byte-boards-secret-change-in-production';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string; role: string };
    }
  }
}

function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const token = auth.slice(7);
    req.user = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== Role.ADMIN) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL. Set it before starting the backend.');
  process.exit(1);
}
const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const TARGET_SCORE = 8;
const MAX_TURNS = 500;
const GAME_TYPES = ['catan-classic', 'catan-seafarers'];
const DEFAULT_AGENTS: { name: string; description: string; traits: string[] }[] = [
  { name: 'HexaMind',   description: 'Expansion-focused strategic planner',      traits: ['Expansionist', 'Aggressive'] },
  { name: 'RoadRunner', description: 'Fast settlement and road builder',          traits: ['Aggressive', 'HardTrader'] },
  { name: 'PortTrader', description: 'Resource conversion and trade optimizer',   traits: ['Greedy', 'HardTrader'] },
  { name: 'SheepBaron', description: 'Development card and resource hoarder',     traits: ['Greedy', 'Defensive'] },
];
const liveMatchJobs = new Set<string>();
const pausedMatchJobs = new Set<string>();
const sseSubscribers = new Map<string, Set<Response>>();

type MatchWithDetails = Awaited<ReturnType<typeof getMatchWithDetails>>;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


async function seedAgentsIfNeeded(): Promise<void> {
  const existing = await prisma.agent.count();
  if (existing > 0) {
    for (const agentDef of DEFAULT_AGENTS) {
      await prisma.agent.updateMany({
        where: { name: agentDef.name, description: null },
        data: { description: agentDef.description },
      });
    }
    return;
  }

  const traitRows = await prisma.trait.findMany({ select: { id: true, name: true } });
  const idOf = Object.fromEntries(traitRows.map(r => [r.name, r.id]));

  for (const agentDef of DEFAULT_AGENTS) {
    const agent = await prisma.agent.create({
      data: { name: agentDef.name, description: agentDef.description },
    });
    const records = agentDef.traits.map(t => idOf[t]).filter(Boolean).map(traitId => ({ agentId: agent.id, traitId }));
    if (records.length > 0) {
      await prisma.agentTrait.createMany({ data: records, skipDuplicates: true });
    }
  }
}

async function seedTraitsIfNeeded(): Promise<void> {
  const existing = await prisma.trait.count();
  if (existing >= ALL_TRAITS.length) return;

  for (const name of ALL_TRAITS) {
    await prisma.trait.upsert({
      where: { name },
      update: { description: TRAIT_DESCRIPTIONS[name] },
      create: { name, description: TRAIT_DESCRIPTIONS[name] },
    });
  }

  const rows = await prisma.trait.findMany({ select: { id: true, name: true } });
  const idOf = Object.fromEntries(rows.map(r => [r.name, r.id]));

  type TraitName = keyof typeof TRAIT_CONFLICTS;
  for (const [a, bList] of Object.entries(TRAIT_CONFLICTS) as [TraitName, TraitName[]][]) {
    for (const b of (bList ?? [])) {
      const aId = idOf[a];
      const bId = idOf[b];
      if (!aId || !bId) continue;
      await prisma.traitConflict.createMany({
        data: [{ sourceId: aId, targetId: bId }, { sourceId: bId, targetId: aId }],
        skipDuplicates: true,
      });
    }
  }
}

async function getMatchWithDetails(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      winner: true,
      agents: {
        include: {
          agent: {
            include: {
              agentTraits: { include: { trait: true } },
              createdBy: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { seat: 'asc' },
      },
      events: {
        include: { actor: true },
        orderBy: [{ turn: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });
}

async function generateAiSummary(match: NonNullable<MatchWithDetails>): Promise<string> {
  const winnerName = match.winner?.name ?? 'Unknown';
  const fallback = `${winnerName} won the match.`;

  try {
    const standings = match.agents.map(a => `${a.agent.name} ${a.score}VP`).join(', ');

    // Only effective actions — exclude passes, discards, and robber-only moves
    const SKIP = /passes their turn|discards|no discards/i;
    const actions = match.events
      .filter(e => e.type === EventType.MOVE && e.actor && !SKIP.test(e.text))
      .map(e => `${e.actor!.name}: ${e.text}`);

    // Sample spread across the match: first quarter, midpoint, last quarter
    const n = actions.length;
    const picks = n <= 12
      ? actions
      : [
          ...actions.slice(0, 3),
          ...actions.slice(Math.floor(n / 2) - 1, Math.floor(n / 2) + 2),
          ...actions.slice(-4),
        ];

    if (picks.length === 0) return fallback;

    const prompt =
      `Game: ${match.gameType === 'catan-seafarers' ? 'Catan Seafarers' : 'Catan Classic'}. ` +
      `Winner: ${winnerName}. Standings: ${standings}. ` +
      `Key moves: ${picks.join(' | ')}`;

    const raw = await callGemini(
      prompt,
      'You are a sports commentator writing a 2-3 sentence match recap for a Catan board game. Focus on how the winner secured their victory — mention specific builds, trades, or steals if present. Be vivid and concrete. Plain text only.',
      { model: 'gemini-1.5-flash-8b', responseMimeType: 'text/plain', maxOutputTokens: 150, temperature: 0.8 },
    );

    const summary = raw.trim();
    return summary.length > 10 ? summary : fallback;
  } catch {
    return fallback;
  }
}

const BLOCKLIST_RE = /\b(dick|cock|penis|vagina|pussy|fuck|shit|ass|bitch|bastard|cunt|whore|slut|pula|pizda|muie|cacat|futut|futu|cur\b|prost|idiot|retard|nigger|faggot|suge|sugeo|suge-o)\b/i;

function blocklisted(name: string): boolean {
  return BLOCKLIST_RE.test(name);
}

async function validateName(name: string): Promise<boolean> {
  // Always apply local blocklist first — works even when Gemini is rate-limited
  if (blocklisted(name)) {
    console.log(`[validateName] "${name}" → BLOCKED by local blocklist`);
    return false;
  }

  if (!hasGeminiKey()) return true;

  const userPrompt = `Name: "${name}"`;
  const systemPrompt = 'You are a strict content moderator for a game platform. Reply with exactly one word: CLEAN or OFFENSIVE. The name is OFFENSIVE if it contains profanity, slurs, sexual references, or hate speech in any language — including Romanian words like pula, pizda, muie, cacat, or similar expressions.';
  try {
    const raw = await callGemini(userPrompt, systemPrompt, { maxOutputTokens: 5, temperature: 0, responseMimeType: 'text/plain' });
    const verdict = raw.trim().toUpperCase();
    console.log('═══════════════════════════════════════════');
    console.log('[validateName] SYSTEM :', systemPrompt);
    console.log('[validateName] USER   :', userPrompt);
    console.log('[validateName] RAW    :', JSON.stringify(raw));
    console.log('[validateName] VERDICT:', verdict);
    console.log('[validateName] RESULT :', verdict.includes('OFFENSIVE') ? 'BLOCKED' : 'ALLOWED');
    console.log('═══════════════════════════════════════════');
    return !verdict.includes('OFFENSIVE');
  } catch (err) {
    console.warn('[validateName] Gemini unavailable — falling back to local blocklist only:', (err as Error).message);
    return true;
  }
}

function publishSse(matchId: string, payload: unknown): void {
  const clients = sseSubscribers.get(matchId);
  if (!clients) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => {
    client.write(message);
  });
}

async function appendEvent(input: {
  matchId: string;
  turn: number;
  type: EventType;
  text: string;
  actorId?: number;
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.matchEvent.create({
    data: {
      matchId: input.matchId,
      turn: input.turn,
      type: input.type,
      text: input.text,
      actorId: input.actorId,
      payload: input.payload
    }
  });
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildOccupancy(stateMap: Map<number, PlayerState>): BoardOccupancy {
  return {
    settlements: [...stateMap.values()].flatMap(p => p.settlementNodes),
    cities:      [...stateMap.values()].flatMap(p => p.cityNodes),
    roads:       [...stateMap.values()].flatMap(p => p.roadEdges),
  };
}

function stealRandom(victim: PlayerState, thief: PlayerState): void {
  const available = RESOURCES.filter(r => victim[r] > 0);
  if (available.length === 0) return;
  const res = available[Math.floor(Math.random() * available.length)];
  victim[res] -= 1;
  thief[res] += 1;
}

function updateLargestArmy(stateMap: Map<number, PlayerState>): void {
  let currentHolderId: number | null = null;
  let currentHolderKnights = 0;
  for (const [id, s] of stateMap) {
    if (s.hasLargestArmy) { currentHolderId = id; currentHolderKnights = s.knightsPlayed; }
  }
  if (currentHolderId === null) {
    let bestId: number | null = null;
    let bestKnights = 2;
    for (const [id, s] of stateMap) {
      if (s.knightsPlayed > bestKnights) { bestKnights = s.knightsPlayed; bestId = id; }
    }
    if (bestId !== null) stateMap.get(bestId)!.hasLargestArmy = true;
  } else {
    for (const [id, s] of stateMap) {
      if (id !== currentHolderId && s.knightsPlayed > currentHolderKnights) {
        stateMap.get(currentHolderId)!.hasLargestArmy = false;
        s.hasLargestArmy = true;
        currentHolderKnights = s.knightsPlayed;
        currentHolderId = id;
      }
    }
  }
}

function updateLongestRoad(stateMap: Map<number, PlayerState>): void {
  function roadLen(id: number, s: PlayerState): number {
    const myOcc = new Set([...s.settlementNodes, ...s.cityNodes]);
    const oppOcc = new Set<number>();
    for (const [oid, os] of stateMap) {
      if (oid !== id) {
        for (const n of os.settlementNodes) oppOcc.add(n);
        for (const n of os.cityNodes) oppOcc.add(n);
      }
    }
    return computeLongestRoad(s.roadEdges, myOcc, oppOcc);
  }

  let currentHolderId: number | null = null;
  let currentHolderLen = 0;
  for (const [id, s] of stateMap) {
    if (s.hasLongestRoad) { currentHolderId = id; currentHolderLen = roadLen(id, s); break; }
  }

  if (currentHolderId === null) {
    let bestId: number | null = null;
    let bestLen = 4;
    for (const [id, s] of stateMap) {
      const len = roadLen(id, s);
      if (len > bestLen) { bestLen = len; bestId = id; }
    }
    if (bestId !== null) stateMap.get(bestId)!.hasLongestRoad = true;
  } else {
    for (const [id, s] of stateMap) {
      if (id === currentHolderId) continue;
      const len = roadLen(id, s);
      if (len > currentHolderLen) {
        stateMap.get(currentHolderId)!.hasLongestRoad = false;
        s.hasLongestRoad = true;
        currentHolderLen = len;
        currentHolderId = id;
      }
    }
  }
}

async function persistAgentState(matchId: string, agentId: number, s: PlayerState): Promise<void> {
  await prisma.matchAgent.update({
    where: { matchId_agentId: { matchId, agentId } },
    data: {
      score:           computeVP(s),
      resources:       totalResources(s),
      wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep,
      roads:           s.roadEdges.length,
      settlements:     s.settlementNodes.length,
      cities:          s.cityNodes.length,
      settlementNodes: s.settlementNodes as unknown as Prisma.InputJsonValue,
      cityNodes:       s.cityNodes       as unknown as Prisma.InputJsonValue,
      roadEdges:       s.roadEdges       as unknown as Prisma.InputJsonValue,
      shipEdges:       s.shipEdges       as unknown as Prisma.InputJsonValue,
      devCards:        s.devCards        as unknown as Prisma.InputJsonValue,
      knightsPlayed:   s.knightsPlayed,
      islandVPs:       s.islandVPs,
    },
  });
}

async function runMatchSimulation(matchId: string): Promise<void> {
  if (liveMatchJobs.has(matchId)) return;
  liveMatchJobs.add(matchId);

  try {
    const match = await getMatchWithDetails(matchId);
    if (!match || match.status !== MatchStatus.LIVE) return;

    const isSeafarers = match.gameType === 'catan-seafarers';
    const boardTiles = isSeafarers ? SEA_ALL_TILES : BOARD_TILES;

    const stateMap = new Map<number, PlayerState>();
    const isResume = match.agents.some(e => (e.settlementNodes as unknown[]).length > 0);
    const matchRaw = match as unknown as { devDeck?: DevCardType[]; robberTile?: number; pirateHex?: number | null; largestArmyHolder?: number | null; longestRoadHolder?: number | null };

    if (isResume) {
      for (const entry of match.agents) {
        const entryRaw = entry as unknown as { knightsPlayed?: number; shipEdges?: string[]; islandVPs?: number };
        stateMap.set(entry.agentId, {
          agentId: entry.agentId,
          name: entry.agent.name,
          wood: entry.wood, brick: entry.brick, ore: entry.ore,
          wheat: entry.wheat, sheep: entry.sheep,
          settlementNodes: entry.settlementNodes as unknown as number[],
          cityNodes:       entry.cityNodes       as unknown as number[],
          roadEdges:       entry.roadEdges       as unknown as string[],
          shipEdges:       entryRaw.shipEdges    ?? [],
          devCards:        { ...EMPTY_DEV_CARDS, ...(entry.devCards as unknown as Partial<DevCardCounts>) },
          knightsPlayed:   entryRaw.knightsPlayed ?? 0,
          hasLargestArmy:  false,
          hasLongestRoad:  false,
          islandVPs:       entryRaw.islandVPs    ?? 0,
        });
      }
      // Restore largest army holder
      const prevLargestArmy = matchRaw.largestArmyHolder;
      if (prevLargestArmy != null && stateMap.has(prevLargestArmy)) {
        stateMap.get(prevLargestArmy)!.hasLargestArmy = true;
      }
      // Restore longest road holder
      const prevLongestRoad = matchRaw.longestRoadHolder;
      if (prevLongestRoad != null && stateMap.has(prevLongestRoad)) {
        stateMap.get(prevLongestRoad)!.hasLongestRoad = true;
      }
    } else {
      const takenNodes: number[] = [];
      const takenEdges: string[] = [];
      const takenShips: string[] = [];
      for (const entry of match.agents) {
        const placement = isSeafarers
          ? createSeafarersInitialPlacement(takenNodes, takenEdges, takenShips)
          : createInitialPlacement(takenNodes, takenEdges);
        takenNodes.push(...placement.settlementNodes);
        takenEdges.push(...placement.roadEdges);
        if (isSeafarers) takenShips.push(...placement.shipEdges);
        const state: PlayerState = {
          agentId: entry.agentId,
          name: entry.agent.name,
          wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0,
          settlementNodes: placement.settlementNodes,
          cityNodes:       placement.cityNodes,
          roadEdges:       placement.roadEdges,
          shipEdges:       placement.shipEdges ?? [],
          devCards:        { ...EMPTY_DEV_CARDS },
          knightsPlayed:   0,
          hasLargestArmy:  false,
          hasLongestRoad:  false,
          islandVPs:       0,
        };
        stateMap.set(entry.agentId, state);
        await persistAgentState(matchId, entry.agentId, state);
      }
    }

    // Load or initialise dev deck
    let devDeck: DevCardType[] = [];
    if (matchRaw.devDeck && (matchRaw.devDeck as unknown[]).length > 0) {
      devDeck = matchRaw.devDeck;
    } else if (!isResume) {
      devDeck = shuffleDeck();
      await prisma.match.update({ where: { id: matchId }, data: { devDeck: devDeck as unknown as Prisma.InputJsonValue } });
    }

    const lastEvent = await prisma.matchEvent.findFirst({
      where: { matchId },
      orderBy: { turn: 'desc' },
    });
    let turn = isResume ? (lastEvent?.turn ?? 0) + 1 : 1;
    let currentRobberTile: number = matchRaw.robberTile ?? 9;
    let currentPirateHex: number | null = matchRaw.pirateHex ?? null;

    while (true) {
      while (pausedMatchJobs.has(matchId)) {
        await new Promise<void>(resolve => setTimeout(resolve, 500));
      }
      const current = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
      if (!current || current.status === MatchStatus.COMPLETED) return;

      const occupancy = buildOccupancy(stateMap);
      const [d1, d2] = rollDice();
      const total = d1 + d2;

      let robberPayload: RobberPayload | undefined;

      if (total === 7) {
        const msg = handleRobber([...stateMap.values()]);
        if (isSeafarers) {
          // Move pirate to a random outer island tile
          currentPirateHex = OUTER_TILE_INDICES[Math.floor(Math.random() * OUTER_TILE_INDICES.length)];
          await prisma.match.update({ where: { id: matchId }, data: { pirateHex: currentPirateHex } });
        }
        await appendEvent({ matchId, turn, type: EventType.COMMENTARY, text: `${isSeafarers ? 'Pirate & Robber!' : 'Robber!'} Dice: 7. ${msg}${isSeafarers ? ` Pirate moves to tile ${currentPirateHex}.` : '.'}` });
        for (const [agentId, s] of stateMap) {
          await prisma.matchAgent.update({
            where: { matchId_agentId: { matchId, agentId } },
            data: { wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep, resources: totalResources(s) },
          });
        }
        const eligible = getEligibleRobberTiles(currentRobberTile);
        const targets = eligible
          .map(tileIdx => {
            const tile = BOARD_TILES[tileIdx];
            const players = [...stateMap.values()]
              .filter(p =>
                p.settlementNodes.some(n => tile.nodes.includes(n as never)) ||
                p.cityNodes.some(n => tile.nodes.includes(n as never))
              )
              .map(p => ({ id: p.agentId, cards: totalResources(p) }));
            return { tile: tileIdx, players };
          })
          .filter(t => t.players.length > 0);
        robberPayload = { eligibleTiles: eligible, targets };
      }

      const gainLog: string[] = [];
      for (const [agentId, s] of stateMap) {
        let gained: Partial<Record<Resource, number>>;
        if (isSeafarers) {
          const { gained: sfGained, goldCount } = collectSeafarersResources(s, total, boardTiles, currentRobberTile, currentPirateHex);
          gained = sfGained;
          if (goldCount > 0) {
            for (let g = 0; g < goldCount; g++) {
              const pick = pickGoldResource(s);
              gained[pick] = (gained[pick] ?? 0) + 1;
            }
          }
        } else {
          gained = collectResources(s, total, BOARD_TILES, currentRobberTile);
        }
        const entries = (Object.entries(gained) as [string, number][]).filter(([, v]) => v > 0);
        if (entries.length > 0) {
          for (const [res, amt] of entries) {
            (s as unknown as Record<string, number>)[res] += amt;
          }
          gainLog.push(`${s.name} +${entries.map(([r, v]) => `${v}${r[0]}`).join('')}`);
          await prisma.matchAgent.update({
            where: { matchId_agentId: { matchId, agentId } },
            data: { wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep, resources: totalResources(s) },
          });
        }
      }

      await appendEvent({
        matchId, turn, type: EventType.COMMENTARY,
        text: `Dice: ${d1}+${d2}=${total}. ${gainLog.length > 0 ? gainLog.join(', ') : 'No resources produced.'}`,
        payload: { dice: [d1, d2] },
      });

      let robberMoved = false;
      for (const entry of match.agents) {
        const s = stateMap.get(entry.agentId)!;
        const opponents = [...stateMap.values()].filter(p => p.agentId !== entry.agentId);

        // Only the first agent per turn moves the robber on a 7 roll
        const currentRobberPayload = robberMoved ? undefined : robberPayload;

        // Build knight payload when agent has knight cards (before calling AI)
        let knightPayload: KnightPayload | undefined;
        if (s.devCards.knight > 0) {
          const eligibleForKnight = getEligibleRobberTiles(currentRobberTile);
          const knightTargets = eligibleForKnight
            .map(tileIdx => {
              const tile = BOARD_TILES[tileIdx];
              const players = [...stateMap.values()]
                .filter(p =>
                  p.agentId !== s.agentId && (
                    p.settlementNodes.some(n => tile.nodes.includes(n as never)) ||
                    p.cityNodes.some(n => tile.nodes.includes(n as never))
                  )
                )
                .map(p => ({ id: p.agentId, cards: totalResources(p) }));
              return { tile: tileIdx, players };
            })
            .filter(t => t.players.length > 0);
          knightPayload = { eligibleTiles: eligibleForKnight, targets: knightTargets };
        }

        const agentTraits = entry.agent.agentTraits.map(at => at.trait.name as Trait);
        const sfExtra = isSeafarers
          ? getSeafarersExtraActions(s, [...stateMap.values()], occupancy)
          : undefined;
        const sfCtx: SeafarersContext | undefined = isSeafarers ? {
          ships: s.shipEdges,
          pirateHex: currentPirateHex,
          reachableOuterNodes: [...new Set(
            s.shipEdges.flatMap(e => [parseInt(e.slice(0, 2), 10), parseInt(e.slice(2, 4), 10)])
          )].filter(n => OUTER_NODES.has(n)),
          islandVPs: s.islandVPs,
        } : undefined;
        const { action, commentary } = await getAgentDecision(
          entry.agent.name, s, opponents, total, turn, occupancy,
          currentRobberPayload, knightPayload,
          agentTraits.length > 0 ? agentTraits : undefined,
          sfExtra,
          sfCtx,
        );

        const oldVP = computeVP(s);
        let actionText: string;

        if (action.startsWith('knight:')) {
          const parts = action.split(':');
          const newTile = parseInt(parts[1], 10);
          const victimId = parts[2] && parts[2].length > 0 ? parseInt(parts[2], 10) : null;
          s.devCards.knight -= 1;
          s.knightsPlayed += 1;
          if (!isNaN(newTile)) {
            currentRobberTile = newTile;
            await prisma.match.update({ where: { id: matchId }, data: { robberTile: newTile } });
          }
          if (victimId !== null) {
            const victim = stateMap.get(victimId);
            if (victim) { stealRandom(victim, s); await persistAgentState(matchId, victimId, victim); }
          }
          updateLargestArmy(stateMap);
          // Persist largest army holder
          const newHolder = [...stateMap.values()].find(p => p.hasLargestArmy);
          if (newHolder) {
            await prisma.match.update({ where: { id: matchId }, data: { largestArmyHolder: newHolder.agentId, robberTile: currentRobberTile } });
          }
          actionText = `plays a Knight card, moves robber to tile ${newTile}${victimId !== null ? ` and steals from agent ${victimId}` : ''}`;
        } else if (action === 'play_road_building') {
          s.devCards.road_building -= 1;
          const currentOcc = buildOccupancy(stateMap);
          const eligibleRoads = getValidRoadEdges(s, currentOcc);
          let placed = 0;
          for (const edge of eligibleRoads.slice(0, 2)) {
            s.roadEdges.push(edge);
            placed++;
          }
          updateLongestRoad(stateMap);
          const lrHolderRB = [...stateMap.values()].find(p => p.hasLongestRoad);
          await prisma.match.update({ where: { id: matchId }, data: { longestRoadHolder: lrHolderRB?.agentId ?? null } });
          actionText = `plays Road Building, places ${placed} road${placed !== 1 ? 's' : ''}`;
        } else if (action.startsWith('play_monopoly:')) {
          const res = action.slice('play_monopoly:'.length) as Resource;
          s.devCards.monopoly -= 1;
          let stolen = 0;
          for (const [oid, opp] of stateMap) {
            if (oid === s.agentId) continue;
            stolen += opp[res];
            s[res] += opp[res];
            opp[res] = 0;
            await persistAgentState(matchId, oid, opp);
          }
          actionText = `plays Monopoly on ${res}, steals ${stolen} total`;
        } else if (action === 'buy_dev_card') {
          applyAction(s, action);
          if (devDeck.length > 0) {
            const drawn = devDeck.pop()!;
            s.devCards[drawn] += 1;
            await prisma.match.update({ where: { id: matchId }, data: { devDeck: devDeck as unknown as Prisma.InputJsonValue } });
            actionText = `buys a development card`;
          } else {
            actionText = 'tries to buy a dev card but the deck is empty';
          }
        } else if (action.startsWith('robber:')) {
          const parts = action.split(':');
          const newTile = parseInt(parts[1], 10);
          const victimId = parts[2] && parts[2].length > 0 ? parseInt(parts[2], 10) : null;
          if (!isNaN(newTile)) {
            currentRobberTile = newTile;
            await prisma.match.update({ where: { id: matchId }, data: { robberTile: newTile } });
          }
          if (victimId !== null) {
            const victim = stateMap.get(victimId);
            if (victim) {
              stealRandom(victim, s);
              await prisma.matchAgent.update({
                where: { matchId_agentId: { matchId, agentId: victimId } },
                data: { wood: victim.wood, brick: victim.brick, ore: victim.ore, wheat: victim.wheat, sheep: victim.sheep, resources: totalResources(victim) },
              });
            }
          }
          actionText = `moves the robber to tile ${newTile}`;
          robberMoved = true;
        } else if (action.startsWith('build_ship:')) {
          const edge = action.slice('build_ship:'.length);
          s.wood -= 1; s.sheep -= 1;
          s.shipEdges.push(edge);
          actionText = `builds a ship on sea route ${edge}`;
        } else {
          const result = applyAction(s, action);
          actionText = result.text;
          if (action.startsWith('build_road:') || action.startsWith('build_city:')) {
            updateLongestRoad(stateMap);
            const lrHolder = [...stateMap.values()].find(p => p.hasLongestRoad);
            await prisma.match.update({ where: { id: matchId }, data: { longestRoadHolder: lrHolder?.agentId ?? null } });
          }
          if (action.startsWith('build_settlement:') && isSeafarers) {
            const nodeId = parseInt(action.slice('build_settlement:'.length), 10);
            const exploredIsland = checkExplorationVP(nodeId, s.settlementNodes.slice(0, -1));
            if (exploredIsland > 0) {
              s.islandVPs += 1;
              actionText += ` — discovers island ${exploredIsland}! (+1 exploration VP)`;
            }
            updateLongestRoad(stateMap);
            const lrHolder = [...stateMap.values()].find(p => p.hasLongestRoad);
            await prisma.match.update({ where: { id: matchId }, data: { longestRoadHolder: lrHolder?.agentId ?? null } });
          } else if (action.startsWith('build_settlement:')) {
            updateLongestRoad(stateMap);
            const lrHolder = [...stateMap.values()].find(p => p.hasLongestRoad);
            await prisma.match.update({ where: { id: matchId }, data: { longestRoadHolder: lrHolder?.agentId ?? null } });
          }
        }

        const newVP = computeVP(s);
        const vpDelta = newVP - oldVP;
        await persistAgentState(matchId, entry.agentId, s);

        await appendEvent({
          matchId, turn, type: EventType.MOVE, actorId: entry.agentId,
          text: `${entry.agent.name} ${actionText}.`,
          payload: { action, vp: newVP, vpDelta, resources: { wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep } },
        });

        await appendEvent({
          matchId, turn, type: EventType.COMMENTARY, actorId: entry.agentId,
          text: commentary,
        });

        publishSse(matchId, { kind: 'tick', turn, actor: entry.agent.name });

        if (newVP >= TARGET_SCORE) {
          const allAgents = await prisma.matchAgent.findMany({
            where: { matchId }, include: { agent: true },
          });
          const sorted = [...allAgents].sort((a, b) => b.score - a.score || a.seat - b.seat);
          for (let i = 0; i < sorted.length; i++) {
            await prisma.matchAgent.update({
              where: { matchId_agentId: { matchId, agentId: sorted[i].agentId } },
              data: { position: i + 1 },
            });
          }
          await appendEvent({
            matchId, turn: turn + 1, type: EventType.RESULT, actorId: entry.agentId,
            text: `${entry.agent.name} reaches ${newVP} VP — wins the game!`,
          });
          await prisma.match.update({
            where: { id: matchId },
            data: { status: MatchStatus.COMPLETED, endedAt: new Date(), winnerId: entry.agentId },
          });
          const completed = await getMatchWithDetails(matchId);
          if (completed) {
            await prisma.match.update({ where: { id: matchId }, data: { summary: await generateAiSummary(completed) } });
          }
          publishSse(matchId, { kind: 'completed', matchId });
          return;
        }
      }

      turn += 1;

      if (turn > MAX_TURNS) {
        const allAgents = await prisma.matchAgent.findMany({
          where: { matchId }, include: { agent: true },
        });
        const sorted = [...allAgents].sort((a, b) => b.score - a.score || a.seat - b.seat);
        for (let i = 0; i < sorted.length; i++) {
          await prisma.matchAgent.update({
            where: { matchId_agentId: { matchId, agentId: sorted[i].agentId } },
            data: { position: i + 1 },
          });
        }
        const winner = sorted[0];
        await appendEvent({
          matchId, turn, type: EventType.RESULT, actorId: winner.agentId,
          text: `Turn limit reached. ${winner.agent.name} wins with ${winner.score} VP!`,
        });
        await prisma.match.update({
          where: { id: matchId },
          data: { status: MatchStatus.COMPLETED, endedAt: new Date(), winnerId: winner.agentId },
        });
        const completed = await getMatchWithDetails(matchId);
        if (completed) {
          await prisma.match.update({ where: { id: matchId }, data: { summary: await generateAiSummary(completed) } });
        }
        publishSse(matchId, { kind: 'completed', matchId });
        return;
      }
    }
  } catch (error) {
    console.error(`Simulation failed for match ${matchId}:`, error);
    await prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.COMPLETED, endedAt: new Date(), summary: 'Simulation interrupted before completion.' },
    });
  } finally {
    liveMatchJobs.delete(matchId);
  }
}

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hashed, name: name ?? null } });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/auth/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/users', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true } });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(readParam(req.params.id) ?? '');
    if (!id) { res.status(400).json({ error: 'Invalid user id' }); return; }
    if (id === req.user!.id) { res.status(400).json({ error: 'Cannot delete your own account' }); return; }
    await prisma.user.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/agents/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(readParam(req.params.id) ?? '');
    if (!id) { res.status(400).json({ error: 'Invalid agent id' }); return; }
    await prisma.agent.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/matches/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) { res.status(400).json({ error: 'Invalid match id' }); return; }
    const isAdmin = req.user!.role === Role.ADMIN;
    if (!isAdmin) {
      const m = await prisma.match.findUnique({ where: { id: matchId }, select: { createdById: true } });
      if (!m) { res.status(404).json({ error: 'Match not found' }); return; }
      if (m.createdById !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    }
    // Stop simulation before deleting
    pausedMatchJobs.add(matchId);
    liveMatchJobs.delete(matchId);
    await prisma.match.delete({ where: { id: matchId } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/matches/:id/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) { res.status(400).json({ error: 'Invalid match id' }); return; }
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, createdById: true } });
    if (!match) { res.status(404).json({ error: 'Match not found' }); return; }
    const isAdmin = req.user!.role === Role.ADMIN;
    const isCreator = match.createdById === req.user!.id;
    if (!isAdmin && !isCreator) { res.status(403).json({ error: 'Forbidden' }); return; }
    if (match.status === MatchStatus.COMPLETED) { res.status(400).json({ error: 'Match already completed' }); return; }
    // Halt simulation
    pausedMatchJobs.add(matchId);
    liveMatchJobs.delete(matchId);
    await prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.COMPLETED, endedAt: new Date() } });
    const lastEvent = await prisma.matchEvent.findFirst({ where: { matchId }, orderBy: [{ turn: 'desc' }, { createdAt: 'desc' }] });
    await prisma.matchEvent.create({
      data: { matchId, turn: (lastEvent?.turn ?? 0) + 1, type: EventType.RESULT, text: 'Match stopped by the host.' },
    });
    publishSse(matchId, { kind: 'completed', matchId });
    res.json({ status: 'COMPLETED' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/game-types', (req: Request, res: Response) => {
  res.json(GAME_TYPES);
});

app.get('/api/traits', async (_req: Request, res: Response) => {
  try {
    const traits = await prisma.trait.findMany({
      orderBy: { id: 'asc' },
      include: { conflictsAs: true },
    });
    if (traits.length === 0) {
      // DB not seeded yet — fall back to in-memory data
      return res.json(ALL_TRAITS.map(t => ({
        name: t, description: TRAIT_DESCRIPTIONS[t], conflicts: TRAIT_CONFLICTS[t] ?? [],
      })));
    }
    const idToName = Object.fromEntries(traits.map(t => [t.id, t.name]));
    return res.json(traits.map(t => ({
      name: t.name,
      description: t.description,
      conflicts: t.conflictsAs.map(c => idToName[c.targetId]).filter(Boolean),
    })));
  } catch {
    return res.json(ALL_TRAITS.map(t => ({
      name: t, description: TRAIT_DESCRIPTIONS[t], conflicts: TRAIT_CONFLICTS[t] ?? [],
    })));
  }
});

app.get('/api/agents', authenticate, async (req: Request, res: Response) => {
  try {
    await seedAgentsIfNeeded();
    const isAdmin = req.user!.role === Role.ADMIN;

    const agents = await prisma.agent.findMany({
      orderBy: { id: 'asc' },
      where: isAdmin ? undefined : {
        OR: [
          { createdById: null },
          { createdById: req.user!.id },
        ],
      },
      include: { agentTraits: { include: { trait: true } } },
    });
    res.json(
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        traits: agent.agentTraits.map(at => at.trait.name as Trait),
      }))
    );
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/agents', authenticate, async (req: Request, res: Response) => {
  try {
    const name = (req.body as { name?: string }).name?.trim();
    const description = (req.body as { description?: string }).description?.trim() ?? null;
    const traits = ((req.body as { traits?: unknown }).traits ?? []) as Trait[];

    if (!name || name.length < 2 || name.length > 32) {
      res.status(400).json({ error: 'Name must be 2–32 characters' }); return;
    }
    const nameOk = await validateName(name);
    if (!nameOk) {
      res.status(400).json({ error: 'Name contains inappropriate content' }); return;
    }
    // Validate against DB (with in-memory fallback)
    const dbTraits = await prisma.trait.findMany({ include: { conflictsAs: true } }).catch(() => []);
    const validTraitNames = dbTraits.length > 0
      ? dbTraits.map(t => t.name)
      : (ALL_TRAITS as string[]);

    if (!Array.isArray(traits) || traits.some(t => !validTraitNames.includes(t))) {
      res.status(400).json({ error: 'Invalid traits' }); return;
    }

    const idOf = Object.fromEntries(dbTraits.map(t => [t.name, t.id]));

    if (dbTraits.length > 0) {
      const selectedIds = new Set(traits.map(t => idOf[t]).filter(Boolean));
      for (const trait of dbTraits) {
        if (!selectedIds.has(trait.id)) continue;
        for (const c of trait.conflictsAs) {
          if (selectedIds.has(c.targetId)) {
            res.status(400).json({ error: 'Conflicting traits selected' }); return;
          }
        }
      }
    } else if (!validateTraits(traits as Trait[])) {
      res.status(400).json({ error: 'Conflicting traits selected' }); return;
    }

    // Reject duplicate trait sets per user
    const userAgents = await prisma.agent.findMany({
      where: { createdById: req.user!.id },
      include: { agentTraits: { select: { traitId: true } } },
    });
    const selectedTraitIds = new Set(traits.map(t => idOf[t]).filter(Boolean) as number[]);
    const hasDuplicate = userAgents.some(a => {
      const existing = new Set(a.agentTraits.map(at => at.traitId));
      return existing.size === selectedTraitIds.size && [...selectedTraitIds].every(id => existing.has(id));
    });
    if (hasDuplicate) {
      res.status(409).json({ error: 'You already have a bot with these traits' }); return;
    }

    const agent = await prisma.agent.create({
      data: { name, description, createdById: req.user!.id },
    });
    if (traits.length > 0) {
      const selectedTraitRows = await prisma.trait.findMany({
        where: { name: { in: traits } },
        select: { id: true },
      });
      await prisma.agentTrait.createMany({
        data: selectedTraitRows.map(t => ({ agentId: agent.id, traitId: t.id })),
        skipDuplicates: true,
      });
    }
    res.status(201).json({
      id: agent.id, name: agent.name,
      description: agent.description ?? null,
      traits,
    });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === 'P2002') { res.status(409).json({ error: 'Agent name already taken' }); return; }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/agents/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const shareIds = typeof req.query.shareIds === 'string'
      ? req.query.shareIds.split(',').filter(Boolean)
      : [];
    const isAdmin = req.user!.role === Role.ADMIN;

    const matchFilter = isAdmin
      ? undefined
      : {
          match: {
            OR: [
              { createdById: req.user!.id },
              ...(shareIds.length > 0 ? [{ id: { in: shareIds } }] : []),
            ],
          },
        };

    const agentFilter = isAdmin ? undefined : {
      OR: [
        { createdById: null },
        { createdById: req.user!.id },
      ],
    };

    const agents = await prisma.agent.findMany({
      where: agentFilter,
      include: {
        matches: {
          where: matchFilter,
          include: { match: true }
        }
      }
    });

    const payload = agents.map((agent) => {
      const completed = agent.matches.filter((entry) => entry.match.status === MatchStatus.COMPLETED);
      const wins = completed.filter((entry) => entry.position === 1).length;
      const totalVp = completed.reduce((acc, entry) => acc + entry.score, 0);
      const avgVp = completed.length > 0 ? totalVp / completed.length : 0;

      return {
        agentId: agent.id,
        name: agent.name,
        gamesPlayed: completed.length,
        wins,
        winRate: completed.length > 0 ? Number((wins / completed.length).toFixed(2)) : 0,
        averageScore: Number(avgVp.toFixed(2))
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching agent metrics:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/matches', async (req: Request, res: Response) => {
  try {
    const requestedType = typeof req.body?.gameType === 'string' ? req.body.gameType : GAME_TYPES[0];
    const gameType = GAME_TYPES.includes(requestedType) ? requestedType : GAME_TYPES[0];
    const selectedAgentIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.map(Number).filter(Number.isFinite) : [];

    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
    const matchName = rawName && rawName.length > 0 ? rawName.slice(0, 64) : null;
    if (matchName) {
      const nameOk = await validateName(matchName);
      if (!nameOk) return res.status(400).json({ error: 'Match name contains inappropriate content' });
    }

    const rawVisibility = typeof req.body?.visibility === 'string' ? req.body.visibility : 'PRIVATE';
    const visibility = (['PRIVATE', 'PROTECTED', 'PUBLIC'] as const).includes(rawVisibility as 'PRIVATE' | 'PROTECTED' | 'PUBLIC')
      ? (rawVisibility as MatchVisibility)
      : MatchVisibility.PRIVATE;

    let creatorId: number | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try { creatorId = (jwt.verify(auth.slice(7), JWT_SECRET) as { id: number }).id; } catch { /* no user */ }
    }

    await seedAgentsIfNeeded();
    const allAgents = await prisma.agent.findMany({ orderBy: { id: 'asc' } });
    const chosen = selectedAgentIds.length >= 2
      ? allAgents.filter((agent) => selectedAgentIds.includes(agent.id)).slice(0, 4)
      : allAgents.slice(0, 4);

    if (chosen.length < 2) {
      return res.status(400).json({ error: 'At least two agents are required to start a match.' });
    }

    const created = await prisma.match.create({
      data: {
        name: matchName,
        gameType,
        status: MatchStatus.LIVE,
        visibility,
        startedAt: new Date(),
        createdById: creatorId,
        agents: {
          create: chosen.map((agent, idx) => ({
            agentId: agent.id,
            seat: idx + 1,
            score: 2,
            resources: randomInt(1, 4)
          }))
        }
      }
    });

    await appendEvent({
      matchId: created.id,
      turn: 0,
      type: EventType.COMMENTARY,
      text: `New ${gameType} match started with ${chosen.map((agent) => agent.name).join(', ')}.`
    });
    void runMatchSimulation(created.id);

    res.status(201).json({ id: created.id });
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/matches', authenticate, async (req: Request, res: Response) => {
  try {
    const gameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;
    const shareIds = typeof req.query.shareIds === 'string'
      ? req.query.shareIds.split(',').filter(Boolean)
      : [];
    const isAdmin = req.user!.role === Role.ADMIN;

    const where = isAdmin
      ? (gameType ? { gameType } : undefined)
      : {
          ...(gameType ? { gameType } : {}),
          OR: [
            { createdById: req.user!.id },
            ...(shareIds.length > 0 ? [{ id: { in: shareIds } }] : []),
          ],
        };

    const matches = await prisma.match.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        winner: true,
        createdBy: true,
        agents: { include: { agent: true }, orderBy: { seat: 'asc' } }
      }
    });

    res.json(matches.map((match) => ({
      id: match.id,
      name: (match as unknown as { name?: string | null }).name ?? null,
      gameType: match.gameType,
      status: match.status,
      visibility: (match as unknown as { visibility?: string }).visibility ?? 'PRIVATE',
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      winner: match.winner?.name ?? null,
      summary: match.summary,
      shareUrl: `/matches/${match.id}?share=${match.shareToken}`,
      players: match.agents.map((entry) => entry.agent.name),
      createdBy: match.createdBy?.name ?? match.createdBy?.email ?? null,
    })));
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Public matches + matches where the authenticated user is an invited watcher
app.get('/api/matches/discover', authenticate, async (req: Request, res: Response) => {
  try {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { visibility: MatchVisibility.PUBLIC },
          { watchers: { some: { userId: req.user!.id } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        winner: true,
        createdBy: true,
        agents: { include: { agent: true }, orderBy: { seat: 'asc' } },
        watchers: { where: { userId: req.user!.id }, select: { userId: true } },
      },
    });
    res.json(matches.map((match) => ({
      id: match.id,
      name: (match as unknown as { name?: string | null }).name ?? null,
      gameType: match.gameType,
      status: match.status,
      visibility: (match as unknown as { visibility?: string }).visibility ?? 'PUBLIC',
      createdAt: match.createdAt,
      endedAt: match.endedAt,
      winner: match.winner?.name ?? null,
      summary: match.summary,
      shareUrl: `/matches/${match.id}?share=${match.shareToken}`,
      players: match.agents.map((entry) => entry.agent.name),
      createdBy: match.createdBy?.name ?? match.createdBy?.email ?? null,
      isInvited: (match.watchers as { userId: number }[]).some(w => w.userId === req.user!.id),
    })));
  } catch (error) {
    console.error('Error fetching discover matches:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Invite a user (by email) to watch a protected match
app.post('/api/matches/:id/invite', authenticate, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) return res.status(400).json({ error: 'Invalid match id' });

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) return res.status(400).json({ error: 'Email required' });

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const matchRaw = match as unknown as { createdById?: number | null; visibility?: string };
    if (matchRaw.createdById !== req.user!.id && req.user!.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Only the match creator can invite watchers' });
    }

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) return res.status(404).json({ error: 'User not found' });

    await prisma.matchWatcher.upsert({
      where: { matchId_userId: { matchId, userId: invitee.id } },
      update: {},
      create: { matchId, userId: invitee.id },
    });

    res.json({ ok: true, invitedName: invitee.name ?? invitee.email });
  } catch (error) {
    console.error('Error inviting watcher:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/matches/:id', async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) {
      return res.status(400).json({ error: 'Invalid match id' });
    }

    const match = await getMatchWithDetails(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const matchRaw3 = match as unknown as { robberTile?: number; pirateHex?: number | null; createdById?: number | null; name?: string | null; visibility?: string };
    res.json({
      id: match.id,
      name: matchRaw3.name ?? null,
      gameType: match.gameType,
      status: match.status,
      visibility: matchRaw3.visibility ?? 'PRIVATE',
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      summary: match.summary,
      winner: match.winner?.name ?? null,
      shareToken: match.shareToken,
      robberTile: matchRaw3.robberTile ?? 9,
      pirateHex: matchRaw3.pirateHex ?? null,
      createdById: matchRaw3.createdById ?? null,
      standings: (() => {
        const matchRaw2 = match as unknown as { largestArmyHolder?: number | null; longestRoadHolder?: number | null };
        const largestArmyHolder = matchRaw2.largestArmyHolder ?? null;
        const longestRoadHolder = matchRaw2.longestRoadHolder ?? null;
        return match.agents.map((entry) => {
          const entryRaw = entry as unknown as { knightsPlayed?: number; shipEdges?: string[]; islandVPs?: number };
          const devCards = { ...EMPTY_DEV_CARDS, ...(entry.devCards as unknown as Partial<DevCardCounts>) };
          return {
            agentId: String(entry.agentId),
            name: entry.agent.name,
            seat: entry.seat,
            score: entry.score,
            resources: entry.resources,
            position: entry.position,
            wood: entry.wood,
            brick: entry.brick,
            ore: entry.ore,
            wheat: entry.wheat,
            sheep: entry.sheep,
            roads: entry.roads,
            settlements: entry.settlements,
            cities: entry.cities,
            settlementNodes: (entry.settlementNodes as unknown as number[]) ?? [],
            cityNodes:       (entry.cityNodes       as unknown as number[]) ?? [],
            roadEdges:       (entry.roadEdges       as unknown as string[]) ?? [],
            shipEdges:       entryRaw.shipEdges     ?? [],
            devCards,
            knightsPlayed:   entryRaw.knightsPlayed ?? 0,
            islandVPs:       entryRaw.islandVPs     ?? 0,
            hasLargestArmy:  entry.agentId === largestArmyHolder,
            hasLongestRoad:  entry.agentId === longestRoadHolder,
            createdBy: entry.agent.createdBy
              ? (entry.agent.createdBy.name ?? entry.agent.createdBy.email)
              : null,
          };
        });
      })(),
      events: match.events.map((event) => ({
        id: event.id,
        turn: event.turn,
        type: event.type === EventType.RESOURCE ? EventType.COMMENTARY : event.type,
        text: event.text,
        createdAt: event.createdAt,
        actor: event.actor?.name ?? null
      }))
    });
  } catch (error) {
    console.error('Error fetching match details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/matches/:id/stream', async (req: Request, res: Response) => {
  const matchId = readParam(req.params.id);
  if (!matchId) {
    return res.status(400).json({ error: 'Invalid match id' });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ kind: 'connected', matchId })}\n\n`);

  const subscribers = sseSubscribers.get(matchId) ?? new Set<Response>();
  subscribers.add(res);
  sseSubscribers.set(matchId, subscribers);

  req.on('close', () => {
    const current = sseSubscribers.get(matchId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) {
      sseSubscribers.delete(matchId);
    }
  });
});

app.get('/api/matches/share/:shareToken', async (req: Request, res: Response) => {
  try {
    const shareToken = readParam(req.params.shareToken);
    if (!shareToken) {
      return res.status(400).json({ error: 'Invalid share token' });
    }

    const match = await prisma.match.findUnique({
      where: { shareToken },
      include: { winner: true }
    });
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json({
      id: match.id,
      gameType: match.gameType,
      winner: match.winner?.name ?? null,
      summary: match.summary,
      status: match.status
    });
  } catch (error) {
    console.error('Error fetching shared match summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/matches/:id/pause', authenticate, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) { res.status(400).json({ error: 'Invalid match id' }); return; }
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) { res.status(404).json({ error: 'Match not found' }); return; }
    if (match.status !== MatchStatus.LIVE) { res.status(400).json({ error: 'Match is not live' }); return; }
    pausedMatchJobs.add(matchId);
    await prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.PAUSED } });
    publishSse(matchId, { kind: 'paused', matchId });
    res.json({ status: 'PAUSED' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/matches/:id/resume', authenticate, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) { res.status(400).json({ error: 'Invalid match id' }); return; }
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) { res.status(404).json({ error: 'Match not found' }); return; }
    if (match.status !== MatchStatus.PAUSED) { res.status(400).json({ error: 'Match is not paused' }); return; }
    await prisma.match.update({ where: { id: matchId }, data: { status: MatchStatus.LIVE } });
    if (pausedMatchJobs.has(matchId)) {
      // Simulation loop is still in memory, just unblock it
      pausedMatchJobs.delete(matchId);
    } else {
      // Loop was lost (e.g. server restart), restart it from DB state
      void runMatchSimulation(matchId);
    }
    publishSse(matchId, { kind: 'resumed', matchId });
    res.json({ status: 'LIVE' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const maskedUrl = connectionString
    ? connectionString.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')
    : null;
  res.status(dbOk ? 200 : 503).json({
    backend: true,
    database: dbOk,
    databaseUrl: maskedUrl,
    ...(dbError ? { databaseError: dbError } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  (async () => {
    try {
      await seedTraitsIfNeeded();
      await seedAgentsIfNeeded();
    } catch (error) {
      console.error('Failed to seed data:', error);
    }
  })();
  prisma.match.findMany({ where: { status: MatchStatus.LIVE } }).then((liveMatches) => {
    for (const match of liveMatches) {
      void runMatchSimulation(match.id);
    }
  }).catch((error) => {
    console.error('Failed to resume live matches on startup:', error);
  });
});