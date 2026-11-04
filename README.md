# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The app currently includes a mobile-first product landing page and a demonstration review workspace at /review. Account flows, project creation, site crawling, stored uploads, Figma OAuth, captures, and report export require backend implementation.

## Local development

Requires Node.js 22.11+.

```sh
npm install
npm run dev
```

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).


## Design review workspace

The responsive UI prototype is available at `/review` on `main`. It demonstrates page-to-design mapping, compare modes, requirement/backend/AI result tabs, and mobile layout. URL scanning, persistent uploads, Figma OAuth, real captures, and report export are not connected yet; the screen marks these as demo behavior. The product and security contract is in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs/blob/main/docs/DESIGN_CONFORMANCE.md).
