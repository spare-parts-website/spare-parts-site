# Netlify hosting proof — not a production cutover

Use the implementation branch `codex/marketplace-remake`. Keep the existing
Vercel production deployment, domain and Resend webhook unchanged during proof.
The configuration follows Netlify's Next.js and scheduled-function guidance.

## Connect and build

1. Run `npx netlify-cli status`. If unauthenticated, run `npx netlify-cli login`
   and complete authorization in the browser; never paste tokens into chat.
2. Link the intended existing site, or create a dedicated proof site in the
   correct team. Check its plan before building. Do not purchase an upgrade.
3. Use an isolated staging database and synthetic accounts. Configure database
   URLs and a distinct authentication secret using Netlify's secret settings,
   not committed files. Do not import the local placeholder environment file.
4. Set `APP_URL` to the exact HTTPS proof origin. Leave `JOBS_ENABLED` unset
   and `AI_SYNTHETIC_HEALTH_ENABLED` unset. Keep live payment/shipping execution off.
   Do not expose live Resend credentials to a public test deployment.
5. Run `npx netlify-cli build`, then a draft `npx netlify-cli deploy`.
   Record Git SHA, adapter version, deploy ID, URL and build log evidence.
   A successful plain Next.js build is not Netlify runtime verification.

## Required proof matrix

| Check | Evidence required |
| --- | --- |
| Prisma | Synthetic read/write and transaction through deployed API |
| CSP/proxy | Unique HTML nonce, matching scripts, no unsafe-inline fallback |
| Sessions | Secure host-only cookies; logout revocation; role/ownership denial |
| Routes | Direct URLs, refresh, navigation and not-found; no SPA catch-all rewrite |
| Images | Allowed Supabase image transformation and disallowed-source rejection |
| Streaming | First chunk, completion, cancellation and provider failure |
| Email | Test-only delivery, duplicate events, retry and operational visibility |
| Sitemap | XML index/shards, escaping, private/moderated exclusion and bounded queries |
| Browser | 360/390px and desktop, light/dark, focus and no hydration errors |
| Quotas | Measured traffic/build/compute/storage/email use plus 30% headroom |

The existing Next.js configuration rewrites legacy image names into `public`
files. Netlify documents this as unsupported, so `netlify.toml` also defines
exact host-level aliases. Check every alias on the proof deployment, including
`/favicon.ico`, before release. The Next.js rewrites remain for rollback-host
compatibility; there is no broad catch-all redirect.

## Scheduled work

The workers use Netlify runtime environment access. Email retry runs every five
minutes; daily cleanup runs at 03:00 UTC. This means 8,640 email worker invocations
and 30 cleanup invocations in a 30-day month if continuously enabled, plus their
downstream API invocations. Include both in the capacity budget; these are not
free-of-cost assumptions or a throughput guarantee.

Each worker fails closed without `JOBS_ENABLED=1`, a clean HTTPS `APP_URL` and
`CRON_SECRET`. Requests are bounded and never follow redirects. No response body
or exception details are returned from the upstream job.

Netlify schedules run only on published deploys. A draft proves packaging but
not the timer. Test the timer on a dedicated published staging site with
synthetic data before enabling any production schedule.

## Cutover and rollback gate

Do not change DNS until the matrix passes and an encrypted restore has been
demonstrated. Record current DNS values and the tested Vercel rollback deployment.
Use backward-compatible database changes so both deployments can run the schema.

At an approved cutover, ensure only one host owns each periodic job, preserve the
public domain and webhook path, and verify the intended commit on that domain.
For rollback, disable Netlify jobs before restoring the tested host and DNS.
Verify order, inventory, session and queue state; do not restore an old database
over new orders simply to roll back application code.

## Sources

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/build/functions/scheduled-functions/
