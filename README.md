# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The first commit establishes the public product shell and explains the three supported starting modes: build from an idea, continue an existing project, or request read-only analysis. Account flows and project actions are intentionally not presented as active before the API supports them.

## Local development

Requires Node.js 22.11+.

```sh
npm install
npm run dev
```

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).
