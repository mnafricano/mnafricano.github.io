# Revenue Auditor operations

## Environments

- Develop with the Supabase CLI, Stripe test mode, the QuickBooks sandbox, and a local `.env`.
- Production uses one Supabase Pro project, Stripe live mode, approved QuickBooks OAuth, SendGrid custom SMTP, and GitHub Pages.
- Never commit browser, Supabase, Stripe, QuickBooks, or SendGrid secrets. Browser configuration contains only the Supabase URL, anonymous key, public site URL, support address, and sender-ready flag.

## Required production settings

Configure the frontend build with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`, `VITE_SUPPORT_EMAIL`, `VITE_AUTH_FROM_EMAIL`, `VITE_TURNSTILE_SITE_KEY`, and `VITE_EMAIL_AUTH_ENABLED=true`. Keep registration disabled until the support address, verified SMTP sender, and free Cloudflare Turnstile site are working.

Configure Supabase function secrets from `supabase/.env.example`. Set the scheduled-maintenance request authorization in the scheduler and run the schedule at least daily. Configure Stripe's webhook endpoint for the deployed `stripe-webhook` function and subscribe to Checkout and customer-subscription lifecycle events.

## Deployment order

1. Create or upgrade the production Supabase project to Pro.
2. Apply migrations and run database tests.
3. Deploy Edge Functions and set secrets.
4. Configure SMTP, authentication redirects, CAPTCHA, OAuth redirects, and the scheduler.
5. Configure Stripe products/prices, portal, webhook signing secret, and live Checkout.
6. Build and deploy GitHub Pages through Actions.
7. Complete signup, MFA, import, audit, invitation, Checkout, portal, cancellation, export, deletion, provider sync, and cross-account isolation smoke tests.

## Monitoring and response

Review the platform-admin console daily during launch. It exposes aggregate user/workspace/subscription counts, usage, failed syncs, webhook health, and support requests without customer document access. Investigate repeated webhook or sync failures from their identifiers and sanitized error codes; logs must not contain document bodies, financial values, tokens, or secrets.

If a credential is exposed, rotate it immediately, revoke affected OAuth grants, review sanitized operational events, and redeploy. If authorization isolation is suspect, disable the affected function or integration until the RLS and signed-URL tests pass.

## Backups and lifecycle

Use Supabase Pro backups before accepting payment. Regularly test restoring to an isolated project. Account deletion enters a seven-day grace period; scheduled maintenance permanently purges due accounts and private storage. Exports must complete before deletion is requested.

## Launch gates

The public launch remains blocked until the sender/support email is supplied, Supabase/Stripe/QuickBooks/SendGrid credentials are created, OAuth production approval is complete, legal copy is reviewed, and live Stripe Checkout is enabled. The product is decision support—not accounting or legal advice—and must not be marketed for HIPAA or similarly regulated data.
