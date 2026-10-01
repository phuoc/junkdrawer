# --- build the React app ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime: TypeScript server run directly by Node (type stripping) ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 JUNK_DB=/data/junk.db
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://localhost:3000/ >/dev/null || exit 1
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
