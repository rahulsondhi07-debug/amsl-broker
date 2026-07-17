# ---- AMSL Broker: single-image build (UI + API on one port) ----
# glibc base so better-sqlite3 uses its prebuilt binary (no native compile)
FROM node:22-bookworm-slim

WORKDIR /app

# 1) install deps first (better layer caching) — workspace manifests only
COPY package.json ./
COPY amsl-backend/package.json ./amsl-backend/package.json
COPY amsl-frontend/package.json ./amsl-frontend/package.json
RUN npm install

# 2) copy the rest of the source and build the frontend
COPY . .
RUN npm run build

# 3) runtime config
RUN mkdir -p /app/data
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/app/data/amsl.db
EXPOSE 4000

# backend serves the built UI + the API on :4000
CMD ["npm", "--workspace", "amsl-backend", "start"]
