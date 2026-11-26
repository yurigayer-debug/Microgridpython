# Imagem do CRM Delta Solar (Node 22). O backup diário do banco fica no container "backup" do docker-compose.
FROM node:22-alpine
WORKDIR /app
COPY servidor/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY servidor/server.js servidor/gas-shim.js ./
COPY index.html ./index.html
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/saude || exit 1
CMD ["node", "server.js"]
