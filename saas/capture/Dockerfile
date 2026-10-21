# A captura de sites na nuvem. Construa a partir da raiz do repositório:
#   docker build -f saas/capture/Dockerfile -t webconstructor-capture .
# A imagem do Playwright traz o Chromium da mesma versão do @playwright/test (playwright.dev/docs/docker).
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY saas/capture/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
# o código da captura e o núcleo do editor que ela usa (o mesmo do Companion)
COPY tools/companion tools/companion
COPY src src
COPY saas/capture saas/capture
# sites desconhecidos: o navegador roda sem root, com o sandbox do Chromium (a documentação do Playwright pede isso)
USER pwuser
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "saas/capture/server.ts"]
