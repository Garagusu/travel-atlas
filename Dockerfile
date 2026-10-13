# Production image: builds the app and runs migrations + geo seed on start.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_MAP_STYLE_URL=""
ENV NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage
USER node
EXPOSE 3000
# Migrations and the geo seed are idempotent, so running them on every start is safe.
CMD ["sh", "-c", "npm run db:setup && npx next start -p ${PORT}"]
