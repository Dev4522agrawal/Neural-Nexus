#!/usr/bin/env bash
# Neural Nexus — one-click brain backup. Usage: ./scripts/backup.sh
# Produces backups/nexus-backup-<date>/ with both databases.
set -e
cd "$(dirname "$0")/.."

STAMP=$(date +%Y-%m-%d_%H%M)
DIR="backups/nexus-backup-$STAMP"
mkdir -p "$DIR"

echo "🧠 backing up to $DIR"

# Postgres: plain SQL dump (conversations, events, insights, import ledger)
docker exec nexus-postgres pg_dump -U nexus nexus > "$DIR/postgres.sql"
echo "✅ postgres dumped ($(du -h "$DIR/postgres.sql" | cut -f1))"

# Neo4j: brief stop → tar the data volume → restart (dump needs the DB offline)
echo "⏳ neo4j pausing for a consistent snapshot…"
docker compose stop neo4j >/dev/null
docker run --rm --volumes-from nexus-neo4j -v "$(pwd)/$DIR":/backup alpine \
  tar czf /backup/neo4j-data.tar.gz /data 2>/dev/null
docker compose start neo4j >/dev/null
echo "✅ neo4j archived ($(du -h "$DIR/neo4j-data.tar.gz" | cut -f1)) and restarted"

echo "🧠 backup complete: $DIR"
echo "   restore: psql the .sql into a fresh postgres; untar /data into the neo4j volume."
