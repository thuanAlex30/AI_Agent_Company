FROM node:20-alpine
WORKDIR /app

# Phase 6 (OPS-05): container chay user KHONG phai root.
# Tao user rieng + group; chmod thu muc cho user nay.
RUN addgroup -S bizops && adduser -S -G bizops -h /app bizops

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --chown=bizops:bizops . .

# Logs ghi ra volume mount (./logs) — user `bizops` phai ghi duoc.
RUN mkdir -p /app/logs && chown -R bizops:bizops /app/logs

USER bizops
EXPOSE 3000
CMD ["node", "src/server.js"]
