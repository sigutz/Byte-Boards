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

function describeAction(agentName: string, action: string): string {
  if (action === 'pass') return `${agentName} has nothing useful to do and passes.`;
  if (action.startsWith('build_road:')) {
    const edge = action.slice('build_road:'.length);
    return `${agentName} builds a road on edge ${edge} to expand their network.`;
  }
  if (action.startsWith('build_settlement:')) {
    const node = parseInt(action.slice('build_settlement:'.length), 10);
    return `${agentName} places a settlement at node ${node} to secure a new resource spot.`;
  }
  if (action.startsWith('build_city:')) {
    const node = parseInt(action.slice('build_city:'.length), 10);
    return `${agentName} upgrades node ${node} to a city for double production.`;
  }
  if (action === 'buy_dev_card') return `${agentName} buys a development card, hoping for a Knight or VP.`;
  if (action.startsWith('trade_bank:')) {
    const parts = action.split(':');
    return `${agentName} trades 4 ${parts[1]} for 1 ${parts[2]} at the bank.`;
  }
  if (action.startsWith('play_knight:')) {
    const parts = action.split(':');
    const victim = parts[2] ? ` and steals from agent ${parts[2]}` : '';
    return `${agentName} plays a Knight card, moving the robber to tile ${parts[1]}${victim}.`;
  }
  if (action.startsWith('play_monopoly:')) {
    const res = action.slice('play_monopoly:'.length);
    return `${agentName} plays Monopoly on ${res}, draining all opponents.`;
  }
  if (action === 'play_road_building') return `${agentName} plays Road Building to extend their reach with two free roads.`;
  if (action.startsWith('play_year_of_plenty:')) {
    const res = action.slice('play_year_of_plenty:'.length);
    return `${agentName} plays Year of Plenty, taking 2 free ${res}.`;
  }
  if (action.startsWith('robber:')) {
    const parts = action.split(':');
    const victim = parts[2] ? ` and steals from agent ${parts[2]}` : '';
    return `${agentName} moves the robber to tile ${parts[1]}${victim}.`;
  }
  if (action.startsWith('knight:')) {
    const parts = action.split(':');
    const victim = parts[2] ? ` and steals from agent ${parts[2]}` : '';
    return `${agentName} plays a Knight, placing the robber on tile ${parts[1]}${victim}.`;
  }
  return `${agentName} makes a move.`;
}

function heuristicDecision(agentName: string, validActions: string[]): AIDecision {
  const nonPass = validActions.filter(a => a !== 'pass');
  const action = nonPass.length > 0
    ? nonPass[Math.floor(Math.random() * nonPass.length)]
    : 'pass';
  return { action, commentary: describeAction(agentName, action) };
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
  const userPrompt = `${JSON.stringify(aiInput)}\n\nRespond with JSON: {"a":"<action from moves[]>","c":"<one sentence describing exactly what you are doing and why, naming the specific action — e.g. 'I build a settlement at node 7 to lock in wheat production before the others do.'>"}`;

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
