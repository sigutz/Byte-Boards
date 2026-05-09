import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, MatchStatus, EventType, Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { PlayerState } from './game/catan';
import {
  createStartingTiles, rollDice, collectResources,
  applyAction, computeVP, handleRobber, totalResources,
} from './game/catan';
import { getAgentDecision } from './game/ai';

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
const DEFAULT_AGENTS = [
  { name: 'HexaMind', description: 'Expansion-focused strategic planner' },
  { name: 'RoadRunner', description: 'Fast settlement and road builder' },
  { name: 'PortTrader', description: 'Resource conversion and trade optimizer' },
  { name: 'SheepBaron', description: 'Development card and resource hoarder' }
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
  if (liveMatchJobs.has(matchId)) return;
  liveMatchJobs.add(matchId);

  try {
    const match = await getMatchWithDetails(matchId);
    if (!match || match.status !== MatchStatus.LIVE) return;

    // Build in-memory player states — restore from DB if game already started
    const stateMap = new Map<number, PlayerState>();
    const isResume = match.agents.some(e => (e.tiles as unknown[]).length > 0);

    for (const entry of match.agents) {
      if (isResume) {
        stateMap.set(entry.agentId, {
          agentId: entry.agentId,
          name: entry.agent.name,
          wood: entry.wood, brick: entry.brick, ore: entry.ore,
          wheat: entry.wheat, sheep: entry.sheep,
          roads: entry.roads, settlements: entry.settlements, cities: entry.cities,
          tiles: entry.tiles as unknown as import('./game/catan').Tile[],
        });
      } else {
        const tiles = createStartingTiles();
        stateMap.set(entry.agentId, {
          agentId: entry.agentId,
          name: entry.agent.name,
          wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0,
          roads: 0, settlements: 2, cities: 0,
          tiles,
        });
        await prisma.matchAgent.update({
          where: { matchId_agentId: { matchId, agentId: entry.agentId } },
          data: { settlements: 2, score: 2, tiles: tiles as unknown as Prisma.InputJsonValue },
        });
      }
    }

    const lastEvent = await prisma.matchEvent.findFirst({
      where: { matchId },
      orderBy: { turn: 'desc' },
    });
    let turn = isResume ? (lastEvent?.turn ?? 0) + 1 : 1;

    while (true) {
      while (pausedMatchJobs.has(matchId)) {
        await new Promise<void>(resolve => setTimeout(resolve, 500));
      }
      const current = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } });
      if (!current || current.status === MatchStatus.COMPLETED) return;

      const [d1, d2] = rollDice();
      const total = d1 + d2;

      // Roll of 7 → robber
      if (total === 7) {
        const msg = handleRobber([...stateMap.values()]);
        await appendEvent({ matchId, turn, type: EventType.COMMENTARY, text: `Robber! Dice: 7. ${msg}.` });
        // Persist updated resources after discard
        for (const [agentId, s] of stateMap) {
          await prisma.matchAgent.update({
            where: { matchId_agentId: { matchId, agentId } },
            data: { wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep, resources: totalResources(s) },
          });
        }
      }

      // Distribute resources to all players whose tiles match the roll
      const gainLog: string[] = [];
      for (const [agentId, s] of stateMap) {
        const gained = collectResources(s, total);
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

      // Each player acts in seat order
      for (const entry of match.agents) {
        const s = stateMap.get(entry.agentId)!;
        const opponents = [...stateMap.values()].filter(p => p.agentId !== entry.agentId);

        const { action, commentary } = await getAgentDecision(
          entry.agent.name, s, opponents, total, turn,
        );

        const { text: actionText, vpDelta } = applyAction(s, action);
        const newVP = computeVP(s);

        await prisma.matchAgent.update({
          where: { matchId_agentId: { matchId, agentId: entry.agentId } },
          data: {
            score: newVP,
            resources: totalResources(s),
            wood: s.wood, brick: s.brick, ore: s.ore, wheat: s.wheat, sheep: s.sheep,
            roads: s.roads, settlements: s.settlements, cities: s.cities,
          },
        });

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

        // Win check
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
            await prisma.match.update({
              where: { id: matchId },
              data: { summary: buildAutoSummary(completed) },
            });
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
          await prisma.match.update({
            where: { id: matchId },
            data: { summary: buildAutoSummary(completed) },
          });
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

app.delete('/api/matches/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const matchId = readParam(req.params.id);
    if (!matchId) { res.status(400).json({ error: 'Invalid match id' }); return; }
    await prisma.match.delete({ where: { id: matchId } });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/game-types', (req: Request, res: Response) => {
  res.json(GAME_TYPES);
});

app.get('/api/agents', async (req: Request, res: Response) => {
  try {
    await seedAgentsIfNeeded();
    const agents = await prisma.agent.findMany({ orderBy: { id: 'asc' } });
    res.json(
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null
      }))
    );
  } catch (error) {
    console.error('Error fetching agents:', error);
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

    const agents = await prisma.agent.findMany({
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
        gameType,
        status: MatchStatus.LIVE,
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
      gameType: match.gameType,
      status: match.status,
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
        position: entry.position,
        wood: entry.wood,
        brick: entry.brick,
        ore: entry.ore,
        wheat: entry.wheat,
        sheep: entry.sheep,
        roads: entry.roads,
        settlements: entry.settlements,
        cities: entry.cities,
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  seedAgentsIfNeeded().catch((error) => {
    console.error('Failed to seed agents:', error);
  });
  prisma.match.findMany({ where: { status: MatchStatus.LIVE } }).then((liveMatches) => {
    for (const match of liveMatches) {
      void runMatchSimulation(match.id);
    }
  }).catch((error) => {
    console.error('Failed to resume live matches on startup:', error);
  });
});