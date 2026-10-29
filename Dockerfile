# Imagen para Railway (o cualquier lugar con Docker). Next.js corre como servidor Node.
# start.sh espera la base, aplica el esquema (idempotente) y arranca en $PORT.
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Corepack todavía no sabe instalar pnpm 12: se instala la versión exacta del proyecto.
RUN npm install -g pnpm@12.3.4
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node lib/db/setup.sql ./lib/db/setup.sql
COPY --chown=node:node next.config.mjs start.sh ./
USER node
EXPOSE 3000
CMD ["sh", "./start.sh"]
