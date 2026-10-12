# syntax=docker/dockerfile:1.7

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx svelte-kit sync
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
# O servidor em si não precisa de `src/` — o Vite embutiu tudo no build/. Mas o
# seed roda o TypeScript original via tsx e importa dali: o client gerado do
# Prisma (que o generator escreve em src/lib/server/prisma-client) e helpers como
# `registro-hash`. Copiar a pasta inteira (2,8 MB) evita ficar perseguindo
# import por import a cada script novo.
COPY --from=build /app/src ./src
# storage/ precisa existir na imagem já com dono `node`: o volume `comprovantes`
# monta aqui, e um volume novo herda o dono da pasta da imagem. Sem ela, o
# Docker cria o ponto de montagem como root e o mkdir do comprovante dá EACCES.
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
EXPOSE 3050
# Aplica migrations (runtime, precisa de banco vivo) e inicia o servidor.
CMD ["npm", "run", "start:prod"]
