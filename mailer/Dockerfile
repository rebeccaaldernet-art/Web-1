FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
# 8025: signed HTTP API (publish on localhost only, behind HTTPS). 25: bounce receiver.
EXPOSE 8025 25
VOLUME ["/app/data", "/app/keys"]
USER node
CMD ["node", "src/index.js"]
