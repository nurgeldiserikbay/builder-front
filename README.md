# BuildPath Web

Mobile-first Next.js web application and Telegram Mini App.

## Current scope

The app includes a product landing page, account registration/login/email verification, and a connected review workspace at `/review`. The review workspace creates projects and review runs through the backend API, displays discovered pages and worker status, uploads PNG/JPEG page designs to private object storage after checksum/signature/malware checks, and supports page-by-page comparison with the live site or a stored Chromium capture in side-by-side, overlay, and wipe modes.

The review screen can export a JSON report and print a PDF summary. Figma OAuth and page-by-page frame import are available; OAuth requires the backend Figma app configuration described in `builder-back`. For captured pages, the comparison workspace supports synchronized zoom and scroll as well as side-by-side, overlay, and wipe modes. It includes a per-page manual requirements checklist, annotated findings, a browser-local GET/HEAD API probe with expected status and optional JSON-path checks, report signals, and a bounded DOM quality audit from fresh captures. API probe results can be downloaded as sanitized JSON metadata; credentials and response bodies are not persisted. Requirement status is recorded by a reviewer and is not automatically inferred.

On-demand AI visual analysis is available when the backend is configured with `AI_REVIEW_OPENAI_API_KEY` and `AI_REVIEW_OPENAI_MODEL`. The reviewer explicitly starts it for a captured page with a verified mapped design; the private screenshot and design are sent to OpenAI, and one result is saved per capture. The interface shows confidence and evidence and labels findings as suggestions. It does not mark requirements passed or verify backend/API behavior. Pixel differences and DOM audit signals remain deterministic evidence aids; checks without evidence stay unverified.

## Local development

Requires Node.js 22.11+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the BuildPath API. In `builder-back`, copy `.env.example`, run `docker compose up -d` to start PostgreSQL, MinIO, and ClamAV, then start the API and review worker. To enable captures, install Chromium, set `CAPTURE_CHROMIUM_EXECUTABLE_PATH` in the backend environment, and run the worker as a non-root user with restricted egress. Configure the email provider for account registration. The local MinIO credentials are for development only.

The product/API requirements live in [builder-docs](https://github.com/nurgeldiserikbay/builder-docs). The backend API contract is maintained in [builder-back](https://github.com/nurgeldiserikbay/builder-back/blob/main/apps/api/openapi.yaml).
