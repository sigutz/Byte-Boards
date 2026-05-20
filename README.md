# User Stories 

1. As a user, I want to watch AI agents play games in real time so that I can observe their decision-making and strategies.
2. As a user, I want to choose from 2 board/strategy games so that I can pick which game I want the AI agents to compete in.
3. As a user, I want to read an AI-generated summary after each game so that I can quickly understand what happened without watching the full session.
4. As a user, I want to browse a history of all past AI matches so that I can revisit previous games and track patterns over time.
5. As a user, I want to click on a past match to see its details and statistics so that I can analyze specific moments or outcomes in depth.
6. As a user, I want to see performance metrics for each AI agent across games so that I can understand which agents perform best and in which games.
7. As a user, I want to filter the match history by game type so that I can focus on the games I care about most.
8. As a user, I want to trigger a new AI match on demand so that I can generate fresh content and observe new gameplay.
9. As a user, I want to see live AI-generated commentary while a game is being played so that the experience feels more engaging and dynamic.
10. As a user, I want to share a match summary via a link so that I can show others interesting or notable AI game outcomes.

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
