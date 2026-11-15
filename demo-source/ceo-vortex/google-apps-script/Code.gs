/**
 * CEO by Vortex — M3-B: booking sync to Google Sheets.
 *
 * Supabase posts every booking (a new booking or a status change) to this web app,
 * which upserts it into one spreadsheet: one tab per camp or diploma, one row per
 * booking.
 *
 * Every written row is protected against formula injection: the row's cells
 * (columns A to L) are set to plain text BEFORE the values go in, every value is
 * written as a string, and the free-text fields get a leading apostrophe when they
 * start with = + - @, a tab or a carriage return. Phone never gets the apostrophe
 * (the database already validates the number) and keeps its leading +.
 *
 * Setup (see README.md):
 *   Script Properties: SHEET_ID (the spreadsheet id) and WEBHOOK_KEY (a long random
 *   string). Apps Script web apps cannot read request headers, so the shared key is
 *   sent as the URL parameter `key` and verified here against WEBHOOK_KEY.
 */

const HEADERS = [
  'Booking ID',
  'Created at',
  'Status',
  'Student ID',
  'Full name',
  'Phone',
  'Email',
  'University',
  'Faculty',
  'Year',
  'Item',
  'Type',
];

const MAX_TAB_NAME = 90;

/* A leading = + - @, tab or carriage return would let the Sheet interpret the rest
   of the value as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/* Sheet tab names cannot contain : \ / ? * [ ] and must not be empty. */
function tabNameForItem_(title) {
  const name = String(title || '')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (name ? name : 'Bookings').slice(0, MAX_TAB_NAME);
}

function openTab_(spreadsheet, name) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* Finds the row of a booking by its id, or 0 when it is not in the sheet yet. */
function rowForBooking_(sheet, bookingId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][0]) === String(bookingId)) {
      return i + 2;
    }
  }
  return 0;
}

/* Free-text fields carry whatever a student or an admin typed, so they get a
   leading apostrophe when they start with a formula character. Phone is not
   escaped: the database check constraint already restricts it, and its leading +
   must stay intact. */
function safeText_(value) {
  const text = value == null ? '' : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

/* Every value is written as a string; Created at stays the ISO string the
   database sent. */
function bookingToRow_(booking) {
  return [
    booking.booking_id == null ? '' : String(booking.booking_id),
    booking.created_at == null ? '' : String(booking.created_at),
    booking.status == null ? '' : String(booking.status),
    booking.student_code == null ? '' : String(booking.student_code),
    safeText_(booking.full_name),
    booking.phone == null ? '' : String(booking.phone),
    safeText_(booking.email),
    safeText_(booking.university),
    safeText_(booking.faculty),
    booking.year == null ? '' : String(booking.year),
    safeText_(booking.item_title),
    booking.item_type == null ? '' : String(booking.item_type),
  ];
}

/* Writes one booking row: the number format of columns A to L is set to plain
   text ('@') BEFORE the values go in, then every value is written as a string.
   Used for both the append and the full-row update. */
function writeRow_(sheet, row, values) {
  const range = sheet.getRange(row, 1, 1, HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([values]);
}

function reply_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (error) {
    return reply_({ ok: false, error: 'busy' });
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const webhookKey = properties.getProperty('WEBHOOK_KEY');
    const sheetId = properties.getProperty('SHEET_ID');

    if (!webhookKey || !sheetId) {
      return reply_({ ok: false, error: 'not_configured' });
    }
    if (!e || !e.parameter || e.parameter.key !== webhookKey) {
      return reply_({ ok: false, error: 'unauthorized' });
    }

    let booking;
    try {
      booking = JSON.parse(e.postData.contents);
    } catch (error) {
      return reply_({ ok: false, error: 'bad_request' });
    }
    if (!booking || booking.booking_id == null) {
      return reply_({ ok: false, error: 'bad_request' });
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = openTab_(spreadsheet, tabNameForItem_(booking.item_title));
    const row = rowForBooking_(sheet, booking.booking_id);
    const values = bookingToRow_(booking);

    if (row) {
      // A later event rewrites the WHOLE row, not only Status, so a changed
      // phone or profile snapshot is reflected too.
      writeRow_(sheet, row, values);
    } else {
      writeRow_(sheet, sheet.getLastRow() + 1, values);
    }

    return reply_({ ok: true });
  } catch (error) {
    return reply_({ ok: false, error: 'error' });
  } finally {
    lock.releaseLock();
  }
}
