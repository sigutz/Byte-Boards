# User Stories 

1. As a user, I want to watch AI agents play games in real time so that I can observe their decision-making and strategies.
2. As a user, I want to choose from 3 board/strategy games so that I can pick which game I want the AI agents to compete in.
3. As a user, I want to read an AI-generated summary after each game so that I can quickly understand what happened without watching the full session.
4. As a user, I want to browse a history of all past AI matches so that I can revisit previous games and track patterns over time.
5. As a user, I want to click on a past match to see its details and statistics so that I can analyze specific moments or outcomes in depth.
6. As a user, I want to see performance metrics for each AI agent across games so that I can understand which agents perform best and in which games.
7. As a user, I want to filter the match history by game type so that I can focus on the games I care about most.
8. As a user, I want to trigger a new AI match on demand so that I can generate fresh content and observe new gameplay.
9. As a user, I want to see live AI-generated commentary while a game is being played so that the experience feels more engaging and dynamic.
10. As a user, I want to share a match summary via a link so that I can show others interesting or notable AI game outcomes.

## Local Setup

### 1. Create the local database

First, create a folder fot the database:
```bash
mkdir db
cd db
```

Start a PostgreSQL database using Docker. Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  db:
    image: postgres:latest
    container_name: postgres-db
    restart: always
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql

volumes:
  pgdata:
```

Then start the container:

```bash
docker compose up -d --build
```

---

### 2. Clone the project

```bash
cd ..
git clone https://github.com/sigutz/Byte-Boards.git
```

---

### 3. Configure the backend

Go into the backend folder and create the `.env` file with the database URL:

```bash
cd backend
echo 'DATABASE_URL="postgresql://admin:oracle@host.docker.internal:5432/postgres?schema=public"' > .env
```

---

### 4. Start the container app

```bash
cd ..
docker compose up -d --build
```

---

### 5. Access the app

Open in your browser:

```
http://localhost:5173/
```

---

### 6. If you change the Prisma schema

If you modify `schema.prisma`, run:

```bash
cd backend
npx prisma migrate dev --name your_migration_name
```
