# Supabase setup

## Base setup (admin dashboard)

1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql`.
3. Authentication > Users > Add user (your email + password, tick "Auto confirm user").
4. SQL Editor: make that user an admin:
   `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`
5. Project Settings > API: copy the Project URL and the anon / publishable key into `.env`
   (see `.env.example` in the project root).
6. `npm install` then `npm start`, and open /admin.

## M2: student sign-in with Google, profiles and Student ID

Do these in order:

1. SQL Editor: paste and run `supabase/m2-profiles.sql` (safe to run again). It creates `public.profiles`,
   the Student ID generator, the new-user trigger, the backfill and the security rules.
2. Authentication > Sign In / Providers > Google: enable it and paste the Client ID and Client Secret
   from Google Cloud. The callback URL shown there goes into the Google OAuth client's
   "Authorised redirect URIs".
3. Authentication > Sign In / Providers: turn "Allow new users to sign up" ON (students create their account
   by signing in with Google). This replaces the old step that turned it off.
4. Authentication > URL Configuration: set the Site URL to your production URL and add your production URL
   and `http://localhost:3000` to Redirect URLs.
5. Authentication > Sign In / Providers > Email: keep "Confirm email" ON.

Admin safety does not depend on the sign-up setting: only users listed in `public.admins` can write
sessions, courses, diplomas and camps. Students get a profile row and nothing else.

### Security notes

- The Google client secret lives only in the Supabase dashboard. Never put it in the project, `.env` or git.
- Never put the `service_role` key in this project. The anon / publishable key is public by design;
  safety comes from Row Level Security and column privileges.
- A student can read and update only their own profile row, and only `full_name`, `university`, `faculty`
  and `year`. `student_code`, `email` and `user_id` cannot be changed from the browser.
  ## M3-A: course lectures

1. SQL Editor: run `supabase/m3a-lectures.sql` (safe to run again). It creates `public.lectures` (public outline)
   and `public.lecture_media` (the video links, readable only by admins and by entitled signed-in users).
2. Admin: open /admin > Courses > Edit a saved course. The Lectures section appears under the form.
   Add lectures with a YouTube, Vimeo or Google Drive link, then publish each lecture and the course.
3. Who can watch: signed-in students can watch lectures of a published course whose price is empty or 0,
   and lectures marked "Free preview" in a paid course. Other lectures of paid courses stay locked until
   payments exist.

Notes:

- For a paid course always set an explicit price greater than 0. An empty price counts as free for video access.
- Video links are never stored in `items` or in any public table. The embed itself is served by the video
  provider, so for private content use unlisted or domain-restricted videos on the provider side.

## M3-B: booking for camps and diplomas

1. SQL Editor: run `supabase/m3b-bookings.sql` (safe to run again). It adds
   `capacity` and `booking_open` to `items`, creates `bookings` (with the student
   snapshot), `item_private` (the private group links), the `book_item` /
   `cancel_booking` functions and the Google Sheets sync trigger.
2. Google Sheets sync (recommended):
   1. Database > Extensions: enable `pg_net`.
   2. Follow `google-apps-script/README.md` to deploy the Apps Script web app and
      copy its URL with `?key=…` appended.
   3. Store the URL and the key in the Vault (same commands as at the top of
      `supabase/m3b-bookings.sql`):

      ```sql
      select vault.create_secret('https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY', 'sheets_webhook_url');
      select vault.create_secret('YOUR_WEBHOOK_KEY', 'sheets_webhook_key');
      ```
3. Admin: open /admin > Camps or Diplomas > Edit (or Add new). Fill in the capacity
   (optional), tick **Booking open**, and paste the private group link. Save, then
   reopen with Edit to see the Bookings section.
4. Students open /camps/&lt;id&gt; or /diplomas/&lt;id&gt;, complete their profile once, and
   book with a WhatsApp number. Their booking appears in the Google Sheet within
   seconds and in the admin Bookings section (which also has Export CSV).

### Security notes

- The browser never writes to `bookings`. Booking and cancelling happen only inside
  `book_item` and `cancel_booking`, which check sign-in, profile completeness, the
  phone format, capacity and `booking_open`.
- A student can read only their own bookings. Admins read all bookings and can
  change only the `status` column (column-level grant).
- The group link is stored only in `item_private` and is returned to a student only
  when their booking for that item is `confirmed`.
- The webhook URL and key live only in Supabase Vault and in the Apps Script
  Script Properties, never in the project or in git.
