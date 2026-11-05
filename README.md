# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The app includes a product landing page, account registration/login/email verification, and a connected review workspace at `/review`. The review workspace creates projects and review runs through the backend API, displays discovered pages and worker status, uploads PNG/JPEG page designs to private object storage after checksum/signature/malware checks, and supports side-by-side, overlay, and wipe comparison with the live site.

Figma OAuth, isolated browser captures, synchronized zoom/scroll, automated requirement/backend checks, AI comparison, and report export are not connected yet. The interface labels these capabilities as unavailable.

## Local development

Requires Node.js 22.11+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the BuildPath API. In `builder-back`, copy `.env.example`, run `docker compose up -d` to start PostgreSQL, MinIO, and ClamAV, then start the API and discovery worker. Configure the email provider for account registration. The local MinIO credentials are for development only.

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).
