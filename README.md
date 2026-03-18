## Local Setup

### 1. Create the local database

First, start a PostgreSQL database using Docker. Create a `docker-compose.yml` file:

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
cd ../
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
