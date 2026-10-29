#!/bin/sh
set -e

echo "=== A medias No · arrancando ==="
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Falta DATABASE_URL. En Railway: Variables → DATABASE_URL=\${{Postgres.DATABASE_URL}}"
  exit 1
fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "Falta BETTER_AUTH_SECRET (generalo con: openssl rand -hex 32)"
  exit 1
fi

# Esperar a Postgres (máx. 30 intentos, 2 s entre cada uno).
echo "=== Esperando la base de datos ==="
i=1
until node -e "const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 }); c.connect().then(() => c.end()).then(() => process.exit(0), () => process.exit(1))"; do
  if [ "$i" -ge 30 ]; then echo "La base no respondió."; exit 1; fi
  echo "Intento $i/30..."
  i=$((i + 1))
  sleep 2
done
echo "Base disponible."

# Esquema idempotente: crea lo que falta, no borra datos.
echo "=== Aplicando esquema ==="
node scripts/db-setup.mjs

echo "=== Servidor en el puerto ${PORT:-3000} ==="
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
