# Las dependencias nativas se instalan sobre la misma familia de imagen del runtime.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
# El migrador y pdfmake resuelven estos recursos fuera de dist.
COPY drizzle ./drizzle
COPY assets ./assets
RUN mkdir -p /app/storage/avatars /app/storage/signatures /app/storage/contracts
RUN chown -R node:node /app/storage
USER node
VOLUME ["/app/storage"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "--input-type=module", "-e", "fetch('http://127.0.0.1:3000/api/v1/health', { signal: AbortSignal.timeout(4000) }).then(response => response.ok ? response.json() : Promise.reject(new Error('Healthcheck failed'))).then(body => process.exit(body.status === 'ok' && body.db === 'ok' ? 0 : 1))"]
# Las migraciones se ejecutan mediante el servicio tools, nunca al reiniciar.
CMD ["node", "dist/server.js"]
