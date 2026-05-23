import { RESOURCES, computeVP, getValidActions } from './catan';
import type { PlayerState, BoardOccupancy } from './catan';
import { callGemini, hasGeminiKey } from './gemini-client';
import { getAgentTraits, buildSystemPrompt } from './personality';
import type { Trait } from './personality';

export type AIDecision = {
  action: string;
  commentary: string;
};

export type RobberPayload = {
  eligibleTiles: number[];
  targets: { tile: number; players: { id: number; cards: number }[] }[];
};

export type KnightPayload = RobberPayload;

type AIInput = {
  turn: number;
  dice: number;
  inv: { w: number; b: number; o: number; wh: number; sh: number };
  vp: number;
  settlements: number[];
  cities: number[];
  roads: string[];
  moves: string[];
  opp: { id: number; vp: number; res: number }[];
  robber?: RobberPayload;
  dev?: { kn: number; rb: number; yp: number; mo: number };
};

function buildRobberMoves(payload: RobberPayload): string[] {
  const moves: string[] = [];
  for (const target of payload.targets) {
    for (const p of target.players) {
      moves.push(`robber:${target.tile}:${p.id}`);
    }
  }
  if (payload.targets.length === 0) {
    for (const tile of payload.eligibleTiles.slice(0, 10)) {
      moves.push(`robber:${tile}:`);
    }
  }
  return moves;
}

function buildKnightMoves(payload: KnightPayload): string[] {
  const moves: string[] = [];
  for (const target of payload.targets) {
    for (const p of target.players) {
      moves.push(`knight:${target.tile}:${p.id}`);
    }
  }
  if (payload.targets.length === 0) {
    for (const tile of payload.eligibleTiles.slice(0, 10)) {
      moves.push(`knight:${tile}:`);
    }
  }
  return moves;
}

function heuristicDecision(agentName: string, validActions: string[]): AIDecision {
  const nonPass = validActions.filter(a => a !== 'pass');
  const action = nonPass.length > 0
    ? nonPass[Math.floor(Math.random() * nonPass.length)]
    : 'pass';
  return { action, commentary: `${agentName} acts.` };
}

export async function getAgentDecision(
  agentName: string,
  player: PlayerState,
  opponents: PlayerState[],
  diceTotal: number,
  turn: number,
  occupancy: BoardOccupancy,
  robberPayload?: RobberPayload,
  knightPayload?: KnightPayload,
  traitsOverride?: Trait[],
): Promise<AIDecision> {
  const validActions = getValidActions(player, opponents, occupancy);
  const robberMoves = robberPayload ? buildRobberMoves(robberPayload) : [];
  const knightMoves = knightPayload ? buildKnightMoves(knightPayload) : [];
  const allMoves = [...validActions, ...robberMoves, ...knightMoves];

  if (!hasGeminiKey()) return heuristicDecision(agentName, allMoves);

  const hasDevCards = player.devCards.knight > 0 || player.devCards.road_building > 0
    || player.devCards.year_of_plenty > 0 || player.devCards.monopoly > 0;

  const aiInput: AIInput = {
    turn,
    dice: diceTotal,
    inv: { w: player.wood, b: player.brick, o: player.ore, wh: player.wheat, sh: player.sheep },
    vp: computeVP(player),
    settlements: player.settlementNodes,
    cities: player.cityNodes,
    roads: player.roadEdges,
    moves: allMoves,
    opp: opponents.map(o => ({
      id: o.agentId,
      vp: computeVP(o),
      res: RESOURCES.reduce((s, r) => s + o[r], 0),
    })),
    ...(robberPayload ? { robber: robberPayload } : {}),
    ...(hasDevCards ? { dev: { kn: player.devCards.knight, rb: player.devCards.road_building, yp: player.devCards.year_of_plenty, mo: player.devCards.monopoly } } : {}),
  };

  const traits = traitsOverride ?? getAgentTraits(agentName);
  const systemPrompt = buildSystemPrompt(agentName, traits);
  const userPrompt = `${JSON.stringify(aiInput)}\n\nRespond with JSON: {"a":"<action from moves[]>","c":"<one tactical sentence>"}`;

  try {
    const text = await callGemini(userPrompt, systemPrompt);
    const parsed = JSON.parse(text) as { a?: string; c?: string };
    const action = allMoves.includes(parsed.a ?? '') ? parsed.a! : heuristicDecision(agentName, allMoves).action;
    return { action, commentary: parsed.c ?? `${agentName} acts decisively.` };
  } catch (err) {
    console.error(`[AI] ${agentName} call failed:`, (err as Error).message);
    return heuristicDecision(agentName, allMoves);
  }
}
