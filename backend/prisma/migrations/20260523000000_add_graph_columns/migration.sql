-- Add graph-based placement columns to MatchAgent
ALTER TABLE "MatchAgent"
  ADD COLUMN "settlementNodes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "cityNodes"       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "roadEdges"       JSONB NOT NULL DEFAULT '[]';

-- Add robber tile tracker to Match
ALTER TABLE "Match"
  ADD COLUMN "robberTile" INTEGER NOT NULL DEFAULT 9;
