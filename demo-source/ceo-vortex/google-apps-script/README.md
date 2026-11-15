# Booking sync to Google Sheets (M3-B)

Every booking made on the website is sent here from Supabase within seconds and
written into one Google Sheet, so the organizers can follow up with students on
WhatsApp. This web app receives the booking JSON and upserts it by Booking ID.

Why the key travels in the URL: Apps Script web apps cannot read request headers,
so the shared key is sent as the URL parameter `key` and verified here against the
Script Property `WEBHOOK_KEY`.

## Setup (in this order)

1. Create the Google Sheet that will hold the bookings. One tab per camp or diploma
   is created and named automatically; do not rename the tabs afterwards.
2. In the Sheet, open **Extensions > Apps Script**.
3. Delete the sample code and paste all of `Code.gs`.
4. Set the Script Properties (Project Settings > Script Properties):
   - `SHEET_ID` — the spreadsheet ID: the long part of the Sheet URL between `/d/`
     and `/edit`.
   - `WEBHOOK_KEY` — a long random string you invent (32+ mixed characters). Keep
     it secret.
5. **Deploy > New deployment**, select the type **Web app**:
   - Execute as: **Me** (the sheet owner).
   - Who has access: **Anyone**.
   - Click Deploy and authorize when Google asks.
6. Copy the Web app URL and append the key to it:
   `https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY`
7. Store that full URL in Supabase Vault as `sheets_webhook_url`, and the key alone
   as `sheets_webhook_key` (after enabling the `pg_net` extension; the same commands
   are at the top of `supabase/m3b-bookings.sql` as comments):

   ```sql
   select vault.create_secret('https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY', 'sheets_webhook_url');
   select vault.create_secret('YOUR_WEBHOOK_KEY', 'sheets_webhook_key');
   ```

8. Test with a sample booking: book a place on the website and watch the new row
   appear in the Sheet within seconds. You can also test the web app directly:

   ```bash
   curl -X POST "https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY" \
     -H "Content-Type: application/json" \
     -d '{"event":"insert","booking_id":1,"status":"booked","phone":"01012345678","student_code":"CEO-000001","full_name":"Test Student","email":"test@example.com","university":"Cairo University","faculty":"Science","year":1,"item_id":1,"item_title":"Test Camp","item_type":"camps","created_at":"2026-01-01T10:00:00+00:00"}'
   ```

   The response must be `{"ok":true}` and the row must appear in a tab named
   "Test Camp".

   Then test the formula-injection protection with these two bookings:

   ```bash
   curl -X POST "https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY" \
     -H "Content-Type: application/json" \
     -d '{"event":"insert","booking_id":2,"status":"booked","phone":"+201012345678","student_code":"CEO-000002","full_name":"=1+1","email":"test@example.com","university":"Cairo University","faculty":"Science","year":1,"item_id":1,"item_title":"Test Camp","item_type":"camps","created_at":"2026-01-01T10:00:00+00:00"}'

   curl -X POST "https://script.google.com/macros/s/…/exec?key=YOUR_WEBHOOK_KEY" \
     -H "Content-Type: application/json" \
     -d '{"event":"insert","booking_id":3,"status":"booked","phone":"+201012345678","student_code":"CEO-000003","full_name":"=HYPERLINK(\"http://example.com\",\"x\")","email":"test@example.com","university":"Cairo University","faculty":"Science","year":1,"item_id":1,"item_title":"Test Camp","item_type":"camps","created_at":"2026-01-01T10:00:00+00:00"}'
   ```

   The full name `=1+1` and the full name `=HYPERLINK("http://example.com","x")`
   must both appear literally in the Sheet — not as a formula and not as its
   result — and the phone `+201012345678` must keep its leading plus.

## Notes

- Upsert by Booking ID: the first event for a booking appends a row; any later
  event rewrites that whole row (not only Status), so a changed phone or profile
  snapshot is reflected too. Concurrent bookings are serialized with LockService
  so they never collide.
- Every written row is set to plain text first and every value is written as a
  string, so the Sheet never interprets a value as a formula; free-text fields
  that start with = + - @, a tab or a carriage return get a leading apostrophe,
  while the Phone column keeps its leading +.
- Phone numbers and emails are written to the Sheet only. They are never written to
  the script's execution logs.
- If the Sheet or the script is unreachable, the website is unaffected: the booking
  is still saved, and the admin Bookings section has an Export CSV button as a
  backup.
- The key lives only in the Script Properties here and in Supabase Vault. Never put
  it in the project or in git.
