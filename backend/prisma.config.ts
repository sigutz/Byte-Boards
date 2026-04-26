/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  datasource: {
    // `prisma generate` doesn't require a live DB connection, but Prisma config
    // currently hard-fails if DATABASE_URL is missing. Provide a safe fallback
    // so local generation/typechecking works before env is set up.
    url: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db',
  },
});