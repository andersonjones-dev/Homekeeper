# HomeKeeper cloud backup: one-time database setup

HomeKeeper's sign-in and backup live in the same free Supabase project as Let's Go,
so one keep-alive (in the Lets-Go repo) keeps both awake, and data is never paused or lost.

Run this once (about a minute, works from an iPhone):

1. Open supabase.com and sign in. Open the **Let's Go** project.
2. Tap **SQL Editor** (in the side menu), then **New query**.
3. Open `homekeeper.sql` here on GitHub, tap **Raw**, select all and copy.
4. Paste it into the query box and tap **Run**. You should see "Success. No rows returned".

It's safe to run again later. It only adds HomeKeeper's own tables (`hk_homes`, `hk_members`)
and functions; Let's Go's tables are not touched.

What it does:
- Each home is private: only people who signed in and joined it can read or change it.
- Only email accounts can use it (Let's Go's guest accounts can't).
- Saves refuse an out-of-date copy, so two phones never overwrite each other; the app merges and retries.
- Documents and photos are not uploaded; they stay on the phone.
