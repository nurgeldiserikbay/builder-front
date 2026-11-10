// Optional browser error reporting to Sentry or a Sentry-compatible server (for example self-hosted GlitchTip).
// Enabled only when NEXT_PUBLIC_SENTRY_DSN is set at build time. No user data, cookies, URLs with queries or breadcrumbs are sent.
import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration(), Sentry.dedupeIntegration(), Sentry.linkedErrorsIntegration()],
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split("?")[0].split("#")[0].replace(/\/invite\/[^/]+/, "/invite/:token");
      }
      delete event.user;
      return event;
    },
  });
}
