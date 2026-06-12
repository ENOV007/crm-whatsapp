#!/bin/bash
set -e

if [ -n "$DATABASE_URL" ]; then
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\).*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):\([0-9]*\).*|\2|p')
  DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
  DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

  echo "Esperando a que PostgreSQL este listo..."
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null; do
    echo "PostgreSQL no disponible, esperando 3 segundos..."
    sleep 3
  done
else
  echo "Sin DATABASE_URL, usando host local..."
  until pg_isready -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; do
    echo "PostgreSQL no disponible, esperando 3 segundos..."
    sleep 3
  done
fi

echo "Ejecutando migraciones de Prisma..."
npx prisma migrate deploy --schema=src/prisma/schema.prisma

echo "Verificando si hay datos iniciales..."
USER_COUNT=$(echo "SELECT COUNT(*) FROM \"User\"" | npx prisma db execute --schema=src/prisma/schema.prisma --stdin 2>/dev/null | grep -oE '[0-9]+' | head -1)
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "Base de datos vacia, ejecutando seed..."
  node src/prisma/seed.js
else
  echo "Base de datos tiene datos, saltando seed."
fi

echo "Iniciando servidor..."
exec node src/index.js
