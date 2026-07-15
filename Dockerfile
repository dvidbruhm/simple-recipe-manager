# Stage 1: install production deps
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: build CSS (Tailwind v4 CLI)
FROM oven/bun:1-debian AS css-builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ui/css/ src/ui/css/
COPY scripts/build-css.ts scripts/build-css.ts
RUN mkdir -p src/ui/static && bun run build:css

# Stage 3: final runtime image
FROM oven/bun:1-debian
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY src/ src/
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY --from=css-builder /app/src/ui/static/app.css ./src/ui/static/app.css

ENV DATA_DIR=/data
ENV PORT=3000

VOLUME ["/data"]

EXPOSE 3000

CMD ["bun", "src/server.ts"]
