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

echo "Creando grupos personales para Pastora/Admin..."
node src/prisma/create-personal-groups.js 2>/dev/null || echo "Saltando creación de grupos personales."

echo "Verificando si hay datos iniciales..."
USER_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);process.exit()}).catch(()=>{console.log(0);process.exit()})" 2>/dev/null)
echo "User count: $USER_COUNT"
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "Sin usuarios, ejecutando seed..."
  node src/prisma/seed.js
else
  echo "Base de datos tiene $USER_COUNT usuarios, saltando seed."
fi

echo "Configurando rclone..."
if [ -n "$RCLONE_CONFIG" ]; then
  mkdir -p ~/.config/rclone
  echo "$RCLONE_CONFIG" > ~/.config/rclone/rclone.conf
  echo "rclone configurado desde RCLONE_CONFIG."
elif [ -n "$RCLONE_CONFIG_BASE64" ]; then
  mkdir -p ~/.config/rclone
  echo "$RCLONE_CONFIG_BASE64" | base64 -d > ~/.config/rclone/rclone.conf
  echo "rclone configurado desde RCLONE_CONFIG_BASE64."
else
  echo "Sin RCLONE_CONFIG, backups a Drive deshabilitados."
fi

echo "Iniciando servidor..."
exec node src/index.js
