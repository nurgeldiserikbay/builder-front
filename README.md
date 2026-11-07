# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The app includes a product landing page, account registration/login/email verification, and a connected review workspace at `/review`. The review workspace creates projects and review runs through the backend API, displays discovered pages and worker status, uploads PNG/JPEG page designs to private object storage after checksum/signature/malware checks, and supports page-by-page comparison with the live site or a stored Chromium capture in side-by-side, overlay, and wipe modes.

Figma OAuth and page-by-page frame import are available; OAuth requires the backend Figma app configuration described in `builder-back`. Automated requirement/backend checks and AI comparison are not connected yet. The comparison workspace supports synchronized zoom and scroll for captured pages. The interface labels these capabilities as unavailable.

## Local development

Requires Node.js 22.11+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the BuildPath API. In `builder-back`, copy `.env.example`, run `docker compose up -d` to start PostgreSQL, MinIO, and ClamAV, then start the API and review worker. To enable captures, install Chromium, set `CAPTURE_CHROMIUM_EXECUTABLE_PATH` in the backend environment, and run the worker as a non-root user with restricted egress. Configure the email provider for account registration. The local MinIO credentials are for development only.

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).
