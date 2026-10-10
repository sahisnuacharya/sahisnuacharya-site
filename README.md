# sahisnuacharya.com.np

Portfolio website of Sahisnu Acharya, visual designer. Built with Astro and hosted for free on Cloudflare Workers, with a D1 database and Workers KV for images and files.

You do not need to run any code. Follow the steps below once, then every upload to GitHub updates the live site by itself.

---

## Step 1. Upload the files to GitHub

1. Sign in at github.com.
2. Open your private repository `sahisnuacharya-site`.
3. Click **Add file > Upload files**.
4. Unzip the project on your computer, open the `sahisnuacharya-site` folder, select **everything inside it** and drag it into the GitHub page.
   - On a Mac, press `Cmd + Shift + .` in Finder to also show hidden files like `.gitignore`, and include them.
5. Click **Commit changes**.

## Step 2. Connect the repository to Cloudflare

1. Sign in at dash.cloudflare.com.
2. Go to **Compute (Workers) > Workers & Pages > Create > Import a repository**.
3. Connect your GitHub account and pick `sahisnuacharya-site`.
4. Use these settings:
   - Project name: `sahisnuacharya-site`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: leave empty
5. Click **Deploy**. The first deploy takes 2 to 4 minutes.

Cloudflare creates the database and file storage by itself on this first deploy, and the site fills in its starter content the first time someone opens it.

## Step 3. The domain

The domain `sahisnuacharya.com.np` (and `www`) is attached automatically during deploy.

If the deploy fails with a message that a DNS record already exists:

1. Go to your domain in Cloudflare > **DNS > Records**.
2. Delete the old `A`, `AAAA` or `CNAME` records named `sahisnuacharya.com.np` and `www`.
3. Go back to the Worker > **Deployments** and click **Retry deployment**.

While you wait, the site also works on the free `*.workers.dev` address shown in the Worker overview.

## Step 4. Turn on free visitor stats

Worker > **Settings > Domains & Routes**, or your domain > **Analytics & Logs > Web Analytics**: turn on Web Analytics. It uses no cookies.

## Step 5. Updating the site later

- Content (projects, images, offers, prices, photo, CV, messages) is managed in the admin panel, which is the next phase.
- Code updates: upload the changed files to GitHub the same way as Step 1. Cloudflare redeploys within a few minutes.

## Step 6. Spam protection for the contact form (recommended)

1. Cloudflare dashboard > **Turnstile > Add widget**. Name it `Website`, add the hostname `sahisnuacharya.com.np`, choose **Managed**.
2. Copy the **Site key**. In GitHub, open `wrangler.jsonc`, click the pencil icon, paste it between the quotes of `"TURNSTILE_SITE_KEY": ""` and commit.
3. Copy the **Secret key**. In Cloudflare, open the Worker > **Settings > Variables and Secrets > Add**, type **Secret**, name `TURNSTILE_SECRET_KEY`, paste the value and save.

Until then the form is still protected by a hidden bot trap and a limit of 5 messages per hour per visitor.

## Step 7. Email alerts for new messages (optional)

1. Your domain > **Email > Email Routing**: turn it on and add `sahisnuacharya9@gmail.com` as a destination. Click the link in the email Cloudflare sends you.
2. Create the address `hello@sahisnuacharya.com.np` and forward it to the same Gmail.
3. In GitHub, open `wrangler.jsonc`, delete the two slashes in front of the `"send_email"` line and commit.

---

## Step 8. The admin panel

Open `https://sahisnuacharya.com.np/admin`. Nobody can enter without signing in, and the pages are hidden from Google.

**Sign in with an emailed code (works right away).** Enter the admin email, a 6 digit code arrives in that inbox, type it in. The code lasts 10 minutes, and wrong guesses lock the form for a while.

**Sign in with Google (optional, one time setup).**
1. Go to console.cloud.google.com and create a project (free).
2. APIs and Services, then OAuth consent screen. Choose External, fill the app name and your email, and under Test users add the admin Gmail address.
3. Credentials, then Create credentials, then OAuth client ID. Type: Web application. Authorized redirect URI: `https://sahisnuacharya.com.np/api/auth/google/callback`
4. Copy the Client ID into `GOOGLE_CLIENT_ID` in `wrangler.jsonc`.
5. In Cloudflare, open the worker, Settings, Variables and Secrets, add a secret named `GOOGLE_CLIENT_SECRET` with the client secret.

The admin email is `ADMIN_EMAIL` in `wrangler.jsonc`. Only that address can sign in, by either method.

What you can do: add and reorder projects (drafts stay hidden until published, with a private preview), run offers with start and end dates, set NPR and USD prices, edit the Home and About text, upload photos and a CV, read contact messages and download their files, and switch the availability sticker.

## For developers

| Command         | What it does                                                                           |
| --------------- | -------------------------------------------------------------------------------------- |
| `npm install`   | Install dependencies (Node 22.12 or newer)                                             |
| `npm run dev`   | Local site with a local database at http://localhost:4321                              |
| `npm run check` | Type check                                                                             |
| `npm run build` | Production build                                                                       |
| `npm test`      | Playwright tests in Chromium, mobile, Firefox and WebKit with axe accessibility checks |

- Content queries: `src/lib/content.ts`. Database schema and starter content: `src/lib/migrations.ts` (applied automatically, append new migrations only).
- Images live in KV as `img/{id}/{width}.{avif|webp}` and are served by `src/pages/media/[...key].ts`. Contact attachments live under `upload/` and are never public.
- Security headers and the Content Security Policy are set in `src/middleware.ts`.
