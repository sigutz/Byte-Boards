import { GoogleGenerativeAI } from '@google/generative-ai';
import { PlayerState, RESOURCES, getValidActions } from './catan';

const geminiApiKey = process.env.GEMINI_API_KEY;
const client = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Personality prompt per agent name — maps to the agent descriptions in the DB
const PERSONALITIES: Record<string, string> = {
  HexaMind:    'You prioritize territorial expansion. Build settlements and roads aggressively to claim high-value spots before opponents.',
  RoadRunner:  'You race to place roads and cut off expansion routes. Build roads first, then settle the spots you have blocked off.',
  PortTrader:  'You optimize resource efficiency. Trade at the bank when you have surplus, and rush city upgrades for double production.',
  SheepBaron:  'You hoard ore, wheat, and sheep to spam cities and development cards. Avoid roads unless absolutely necessary.',
};

export type AIDecision = {
  action: string;
  commentary: string;
};

// Heuristic fallback when no API key or the API call fails
function heuristicDecision(agentName: string, validActions: string[]): AIDecision {
  const priority = ['build_city', 'build_settlement', 'buy_dev_card', 'build_road'];
  // PortTrader prefers trading first
  if (agentName === 'PortTrader') {
    const trade = validActions.find(a => a.startsWith('trade_bank:'));
    if (trade) return { action: trade, commentary: `${agentName} optimizes through bank trading.` };
  }
  const best = priority.find(a => validActions.includes(a)) ?? validActions[0] ?? 'pass';
  return { action: best, commentary: `${agentName} makes a strategic move.` };
}

export async function getAgentDecision(
  agentName: string,
  player: PlayerState,
  opponents: PlayerState[],
  diceTotal: number,
  turn: number,
): Promise<AIDecision> {
  const validActions = getValidActions(player);
  const personality = PERSONALITIES[agentName] ?? 'You are a balanced Catan player.';

  if (!client) return heuristicDecision(agentName, validActions);

  const resources = RESOURCES.map(r => `${r[0].toUpperCase()}${r.slice(1)}: ${player[r]}`).join(' | ');
  const buildings = `${player.settlements} settlements, ${player.cities} cities, ${player.roads} roads`;
  const vp = computeVPText(player);
  const oppText = opponents
    .map(o => `${o.name}: ${o.settlements + o.cities * 2}VP, ${RESOURCES.reduce((s, r) => s + o[r], 0)} res`)
    .join('; ');

  const prompt = `You are ${agentName} playing Settlers of Catan. ${personality}

TURN ${turn} | Dice: ${diceTotal}
Your VP: ${vp} (first to 10 wins)
Your resources: ${resources}
Your buildings: ${buildings}
Opponents: ${oppText}

Valid actions: ${validActions.join(', ')}

Pick the single best action from the valid list. Return JSON only: {"action": "<exact action from list>", "commentary": "<one tactical sentence>"}`;

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 180,
        responseMimeType: 'application/json',
      },
    });

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);

    const text = result.response.text();
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { action?: string; commentary?: string };
      const action = validActions.includes(parsed.action ?? '') ? (parsed.action ?? 'pass') : 'pass';
      return { action, commentary: parsed.commentary ?? `${agentName} acts decisively.` };
    }
  } catch (err) {
    console.error(`[AI] ${agentName} call failed:`, (err as Error).message);
  }

  return heuristicDecision(agentName, validActions);
}

function computeVPText(player: PlayerState): string {
  const vp = player.settlements + player.cities * 2;
  return `${vp}/10`;
}
