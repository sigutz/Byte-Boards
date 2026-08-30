# User Stories 
### US-01 — Watch a live match
**As a** Guest with a link to a match, **I want to** watch AI agents play a game in real time **so that** I can observe their decision-making and strategies.
- **Acceptance criteria:**
  - Given I have a valid link to a match that is in progress, when I open it, then I see the board state update automatically without a manual refresh.
  - Each move is reflected on the board within 3 seconds of being made.
  - Given I do not have a link to a specific match, when I visit the site as a Guest, then I have no way to browse or discover matches — access is link-only.

### US-02 — Choose a game and mode
**As a** Registered User, **I want to** choose from the available games and modes (Catan Classic, Catan Seafarers) **so that** I can pick the ruleset I want the AI agents to compete in.
- **Acceptance criteria:**
  - Given I start a new match, when I open the setup screen, then I can select a game and, for Catan, a mode (Classic or Seafarers).
  - Given I select Seafarers, when the match starts, then ship edges and island victory points are available in play.

### US-03 — Trigger a new match on demand
**As a** Registered User, **I want to** start a new AI match on demand, choosing the agents and an agent cap **so that** I can generate fresh gameplay to watch.
- **Acceptance criteria:**
  - Given I have at least 2 eligible bots, when I click "New match," then I can select agents up to the configured cap and start the match.
  - Given the agent cap is reached, when I try to add another agent, then the UI prevents it with a clear message.

### US-04 — Stop or delete a running match
**As a** Registered User, **I want to** stop or delete a match I own while it's running **so that** I can cancel a match that's stuck, uninteresting, or started by mistake.
- **Acceptance criteria:**
  - Given I own a running match, when I click "Stop," then the match halts and is marked as ended.
  - Given I own a match, when I delete it, then it no longer appears in my history.
  - 
### US-05 — See live AI-generated commentary
**As a** Guest viewing a match via its link, **I want to** see live AI-generated commentary while the game is being played **so that** the experience feels more engaging and dynamic.
- **Acceptance criteria:**
  - Given a match is in progress, when a significant event occurs (e.g., trade, robber move), then a commentary line appears within a few seconds.

### US-06 — See agent traits and personality in action
**As a** Guest viewing a match via its link, **I want to** see each AI agent's assigned traits/personality **so that** I can understand *why* an agent is making a given decision, not just *what* it did.
- **Acceptance criteria:**
  - Given a match, when I view an agent, then its assigned traits are displayed.
  - Given two agents with conflicting traits, when they interact, then the system resolves the conflict per the defined TraitConflict rules without erroring.

### US-07 — Browse match history
**As a** Registered User, **I want to** browse a history of past AI matches **so that** I can revisit previous games and track patterns over time.
- **Acceptance criteria:**
  - Given I have past matches, when I open "History," then I see a list with date, game type, and participating agents.

### US-08 — View match details and statistics
**As a** Registered User, **I want to** click on a past match to see its details and statistics **so that** I can analyze specific moments or outcomes in depth.
- **Acceptance criteria:**
  - Given a past match, when I open it, then I see the full per-player event log, longest-road holder, and final scores.

### US-09 — Filter match history by game type
**As a** Registered User, **I want to** filter the match history by game type/mode **so that** I can focus on the games I care about most.
- **Acceptance criteria:**
  - Given match history with matches from multiple games/modes, when I select a game type filter, then only matches of that type are shown.

### US-10 — See performance metrics per agent
**As a** Registered User, **I want to** see performance metrics for each of my AI agents across games **so that** I can understand which agents perform best and in which games.
- **Acceptance criteria:**
  - Given an agent with match history, when I view its profile, then I see aggregate stats (e.g., win rate, games played) broken down by game type.
  - 
### US-11 — Read an AI-generated match summary
**As a** Registered User, **I want to** read an AI-generated narrative summary after each game **so that** I can quickly understand what happened without watching the full session.
- **Acceptance criteria:**
  - Given a completed match, when I open its summary, then I see a Gemini-generated narrative reflecting key events (not just a raw stat dump).

### US-12 — Register and log in
**As a** Guest, **I want to** create an account and log in **so that** I can own agents, trigger matches, and control who sees my matches.
- **Acceptance criteria:**
  - Given valid credentials, when I register, then my password is stored hashed (bcrypt) and I receive a JWT session.
  - Given invalid credentials at login, when I submit, then I see an error and no session is created.

### US-13 — Own and manage my bots
**As a** Registered User, **I want to** own the bots/agents I create **so that** only I can configure or enter them into matches on my behalf.

### US-14 — Control match privacy
**As a** Registered User, **I want to** mark my matches as private or public **so that** I decide who can view them.
- **Acceptance criteria:**
  - Given a private match, when a user without access opens the link, then they cannot view match content.

### US-15 — Share a match via link/invite
**As a** Registered User, **I want to** generate a share/invite link (token-based) for a match **so that** I can show specific people an interesting match, including private ones.
- **Acceptance criteria:**
  - Given a private match, when I generate a share token, then anyone with that link can view the match without logging in.

### US-16 — Admin moderation
**As an** Admin, **I want to** delete any match regardless of owner **so that** I can remove inappropriate or broken content from the platform.




## Local Setup

### 1. Clonează proiectul

```bash
git clone https://github.com/sigutz/Byte-Boards.git
cd Byte-Boards
```

---

### 2. Configurează `.env`

Creează fișierul `.env` în rădăcina proiectului:

```bash
cat > .env << 'EOF'
DATABASE_URL="postgresql://admin:admin@db:5432/bytenboard?schema=public"
JWT_SECRET="dev-secret-change-me"
VITE_API_BASE_URL="http://localhost:3003"
EOF
```

> **De ce `db` ca hostname?** Backend-ul rulează în Docker și vede baza de date
> prin numele serviciului `db` din `docker-compose.dev.yml`, nu prin `localhost`.

---

### 3. Pornește toate containerele

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Aceasta pornește simultan: baza de date, backend-ul și frontend-ul.
Backend-ul aşteaptă automat ca DB-ul să fie ready înainte să pornească.

---

### 4. Rulează migrările Prisma (prima dată sau după modificări de schemă)

```bash
docker exec bytenboard-backend-dev npx prisma migrate dev --name init
```

---

### 5. Accesează aplicația
http://localhost:5173

---

### 6. Oprire și curățare

```bash
# Oprire (păstrează datele)
docker compose -f docker-compose.dev.yml down

# Oprire + șterge datele din DB
docker compose -f docker-compose.dev.yml down -v
```

---

### 7. Dacă modifici schema Prisma

```bash
docker exec bytenboard-backend-dev npx prisma migrate dev --name descriere_modificare
```


