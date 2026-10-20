FROM node:24-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/adlererik/WebCaller"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only" org.opencontainers.image.description="WebCaller libsignal/PQXDH browser phone"
WORKDIR /app
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data WEBCALLER_CRYPTO_ENGINE=libsignal-pqxdh-v1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p data && chown node:node data && chmod 700 data
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node .env.example ./
COPY --chown=node:node LICENSE LICENSE-MIT LICENSING.md THIRD_PARTY_NOTICES.md ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080'+new URL(process.env.PUBLIC_URL).pathname.replace(/\/$/,'')+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
