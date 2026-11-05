# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The app includes a product landing page, account registration/login/email verification, and a connected review workspace at `/review`. The review workspace creates projects and review runs through the backend API, displays discovered pages and worker status, and supports a local browser-only design preview beside the live site.

Private design uploads, Figma OAuth, isolated browser captures, synchronized zoom/scroll, automated requirement/backend checks, AI comparison, and report export are not connected yet. The interface labels these capabilities as unavailable.

## Local development

Requires Node.js 22.11+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the BuildPath API, start PostgreSQL and the backend, configure the backend email provider, and run the discovery worker with `npm run start:worker` from `builder-back`.

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).
