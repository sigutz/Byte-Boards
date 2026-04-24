import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, MatchStatus, EventType } from '@prisma/client';
import { Prisma } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const TARGET_SCORE = 10;
const GAME_TYPES = ['catan-classic', 'catan-seafarers'];
const DEFAULT_AGENTS = [
  { name: 'HexaMind', description: 'Expansion-focused strategic planner' },
  { name: 'RoadRunner', description: 'Fast settlement and road builder' },
  { name: 'PortTrader', description: 'Resource conversion and trade optimizer' },
  { name: 'SheepBaron', description: 'Development card and resource hoarder' }
];
const liveMatchJobs = new Set<string>();
const sseSubscribers = new Map<string, Set<Response>>();

type MatchWithDetails = Awaited<ReturnType<typeof getMatchWithDetails>>;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

async function seedAgentsIfNeeded(): Promise<void> {
  const existing = await prisma.agent.count();
  if (existing > 0) {
    return;
  }

  await prisma.agent.createMany({ data: DEFAULT_AGENTS });
}

async function getMatchWithDetails(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      winner: true,
      agents: { include: { agent: true }, orderBy: { seat: 'asc' } },
      events: {
        include: { actor: true },
        orderBy: [{ turn: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });
}

function buildAutoSummary(match: NonNullable<MatchWithDetails>): string {
  const winnerName = match.winner?.name ?? 'Unknown';
  const keyMoves = match.events
    .filter((event) => event.type === EventType.MOVE)
    .slice(-3)
    .map((event) => event.text);

  return keyMoves.length > 0
    ? `${winnerName} a câștigat meciul. Key moments: ${keyMoves.join(' | ')}`
    : `${winnerName} a câștigat meciul.`;
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

async function runMatchSimulation(matchId: string): Promise<void> {
  if (liveMatchJobs.has(matchId)) {
    return;
  }

  liveMatchJobs.add(matchId);
  try {
    const match = await getMatchWithDetails(matchId);
    if (!match || match.status !== MatchStatus.LIVE) {
      return;
    }

    const players = match.agents;
    let turn = 1;
    while (true) {
      const current = pickOne(players);
      const gainedResources = randomInt(1, 3);
      const vpGain = Math.random() > 0.55 ? 1 : 0;

      await prisma.matchAgent.update({
        where: { matchId_agentId: { matchId, agentId: current.agentId } },
        data: {
          resources: { increment: gainedResources },
          score: { increment: vpGain }
        }
      });

      const moveText = `${current.agent.name} builds ${pickOne(['a road', 'a settlement', 'a city'])} and gains ${vpGain} VP.`;
      await appendEvent({
        matchId,
        turn,
        type: EventType.MOVE,
        actorId: current.agentId,
        text: moveText,
        payload: { resourceGain: gainedResources, vpGain }
      });

      const commentaryText = pickOne([
        `${current.agent.name} pivots to wood-brick production to keep expansion tempo.`,
        `${current.agent.name} holds ore-wheat, signaling a development-card strategy.`,
        `${current.agent.name} pressures high-probability intersections for reliable income.`,
        `${current.agent.name} contests trade leverage through port access.`
      ]);
      await appendEvent({
        matchId,
        turn,
        type: EventType.COMMENTARY,
        actorId: current.agentId,
        text: commentaryText
      });
      publishSse(matchId, { kind: 'tick', turn });

      const refreshed = await prisma.matchAgent.findMany({
        where: { matchId },
        include: { agent: true }
      });
      const winner = refreshed.find((entry) => entry.score >= TARGET_SCORE);
      if (winner) {
        const sorted = refreshed
          .slice()
          .sort((a, b) => (b.score - a.score) || (a.seat - b.seat));

        for (let idx = 0; idx < sorted.length; idx += 1) {
          await prisma.matchAgent.update({
            where: { matchId_agentId: { matchId, agentId: sorted[idx].agentId } },
            data: { position: idx + 1 }
          });
        }

        await appendEvent({
          matchId,
          turn: turn + 1,
          type: EventType.RESULT,
          actorId: winner.agentId,
          text: `${winner.agent.name} reaches ${winner.score} VP and closes the game.`
        });

        await prisma.match.update({
          where: { id: matchId },
          data: {
            status: MatchStatus.COMPLETED,
            endedAt: new Date(),
            winnerId: winner.agentId
          }
        });

        const completed = await getMatchWithDetails(matchId);
        if (completed) {
          await prisma.match.update({
            where: { id: matchId },
            data: { summary: buildAutoSummary(completed) }
          });
        }
        publishSse(matchId, { kind: 'completed', matchId });
        break;
      }

      turn += 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } catch (error) {
    console.error(`Simulation failed for match ${matchId}:`, error);
    await prisma.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.COMPLETED, endedAt: new Date(), summary: 'Simulation interrupted before completion.' }
    });
  } finally {
    liveMatchJobs.delete(matchId);
  }
}

app.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/game-types', (req: Request, res: Response) => {
  res.json(GAME_TYPES);
});

app.get('/api/agents/metrics', async (req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({
      include: {
        matches: {
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
        gameType,
        status: MatchStatus.LIVE,
        startedAt: new Date(),
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

app.get('/api/matches', async (req: Request, res: Response) => {
  try {
    const gameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;
    const matches = await prisma.match.findMany({
      where: gameType ? { gameType } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        winner: true,
        agents: { include: { agent: true }, orderBy: { seat: 'asc' } }
      }
    });

    res.json(matches.map((match) => ({
      id: match.id,
      gameType: match.gameType,
      status: match.status,
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      winner: match.winner?.name ?? null,
      summary: match.summary,
      shareUrl: `/matches/${match.id}?share=${match.shareToken}`,
      players: match.agents.map((entry) => entry.agent.name)
    })));
  } catch (error) {
    console.error('Error fetching matches:', error);
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

    res.json({
      id: match.id,
      gameType: match.gameType,
      status: match.status,
      createdAt: match.createdAt,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      summary: match.summary,
      winner: match.winner?.name ?? null,
      shareToken: match.shareToken,
      standings: match.agents.map((entry) => ({
        agentId: String(entry.agentId),
        name: entry.agent.name,
        seat: entry.seat,
        score: entry.score,
        resources: entry.resources,
        position: entry.position
      })),
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  seedAgentsIfNeeded().catch((error) => {
    console.error('Failed to seed agents:', error);
  });
});