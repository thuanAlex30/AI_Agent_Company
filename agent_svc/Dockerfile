FROM node:20-alpine
WORKDIR /app

# Phase 6 (OPS-05): container chay user KHONG phai root.
RUN addgroup -S bizops && adduser -S -G bizops -h /app bizops

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --chown=bizops:bizops . .

USER bizops
EXPOSE 3100
CMD ["node", "server.js"]
