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


## Design review workspace

The first responsive UI prototype is available at `/review` on `feat/phase-0-foundation`. It demonstrates page-to-design mapping, compare modes, requirement/backend/AI result tabs, and mobile layout. URL scanning, persistent uploads, Figma OAuth, real captures, and report export are not connected yet; the screen marks these as demo behavior. The product and security contract is in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs/blob/main/docs/DESIGN_CONFORMANCE.md).
