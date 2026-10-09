FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY clients/web/package.json clients/web/package.json
COPY clients/packages/api/package.json clients/packages/api/package.json
COPY clients/packages/ui/package.json clients/packages/ui/package.json
COPY server/auth/package.json server/auth/package.json

RUN npm ci --omit=dev --workspace=@seametry/auth --include-workspace-root=false

COPY server/auth server/auth

WORKDIR /app/server/auth
USER node
CMD ["node", "src/server.mjs"]
