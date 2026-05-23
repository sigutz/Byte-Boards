import { RESOURCES, computeVP, getValidActions } from './catan';
import type { PlayerState, BoardOccupancy } from './catan';
import { callGemini, hasGeminiKey } from './gemini-client';
import { getAgentTraits, buildSystemPrompt } from './personality';

export type AIDecision = {
  action: string;
  commentary: string;
};

export type RobberPayload = {
  eligibleTiles: number[];
  targets: { tile: number; players: { id: number; cards: number }[] }[];
};

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

function heuristicDecision(agentName: string, validActions: string[]): AIDecision {
  if (agentName === 'PortTrader') {
    const trade = validActions.find(a => a.startsWith('trade_bank:'));
    if (trade) return { action: trade, commentary: `${agentName} optimizes through bank trading.` };
  }
  const prefixes = ['build_city:', 'build_settlement:', 'buy_dev_card', 'build_road:', 'trade_bank:'];
  for (const prefix of prefixes) {
    const match = validActions.find(a => a.startsWith(prefix) || a === prefix);
    if (match) return { action: match, commentary: `${agentName} makes a strategic move.` };
  }
  return { action: validActions[0] ?? 'pass', commentary: `${agentName} passes.` };
}

export async function getAgentDecision(
  agentName: string,
  player: PlayerState,
  opponents: PlayerState[],
  diceTotal: number,
  turn: number,
  occupancy: BoardOccupancy,
  robberPayload?: RobberPayload,
): Promise<AIDecision> {
  const validActions = getValidActions(player, opponents, occupancy);
  const robberMoves = robberPayload ? buildRobberMoves(robberPayload) : [];
  const allMoves = [...validActions, ...robberMoves];

  if (!hasGeminiKey()) return heuristicDecision(agentName, allMoves);

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
  };

  const traits = getAgentTraits(agentName);
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
