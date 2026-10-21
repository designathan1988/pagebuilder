# The cloud site capture. Build from the repository root:
#   docker build -f saas/capture/Dockerfile -t webconstructor-capture .
# The Playwright image ships the Chromium of the same version as @playwright/test (playwright.dev/docs/docker).
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY saas/capture/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
# the capture code and the editor core it uses (the same as the Companion's)
COPY tools/companion tools/companion
COPY src src
COPY saas/capture saas/capture
# unknown sites: the browser runs without root, with the Chromium sandbox (the Playwright documentation asks for this)
USER pwuser
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "saas/capture/server.ts"]
