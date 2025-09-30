# Safer for sharp: Debian slim (glibc)
FROM node:20-bookworm-slim

# Install deps (sharp system libs are bundled; but add basics)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tini   && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev


COPY src ./src
COPY client ./client

# Create data dirs
RUN mkdir -p /data/images/originals /data/images/processed

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Use tini for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
