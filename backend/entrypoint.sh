#!/bin/bash
set -e

echo "Esperando a que PostgreSQL este listo..."
until pg_isready -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; do
  echo "PostgreSQL no disponible, esperando 3 segundos..."
  sleep 3
done

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
