import { google, calendar_v3 } from "googleapis";

let _calendar: calendar_v3.Calendar | null = null;

function getCalendarClient(): calendar_v3.Calendar {
  if (!_calendar) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
          /\\n/g,
          "\n"
        ),
      },
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    _calendar = google.calendar({ version: "v3", auth });
  }
  return _calendar;
}

interface CalendarEventParams {
  summary: string;
  description: string;
  startDateTime: string; // ISO 8601 e.g. "2026-04-13T10:30:00+09:00"
  endDateTime: string;
  attendeeEmails: string[];
  location?: string;
}

export async function createCalendarEvent(
  params: CalendarEventParams
): Promise<{ eventId: string | null; error?: string }> {
  try {
    const calendar = getCalendarClient();
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: {
          dateTime: params.startDateTime,
          timeZone: "Asia/Tokyo",
        },
        end: {
          dateTime: params.endDateTime,
          timeZone: "Asia/Tokyo",
        },
        attendees: params.attendeeEmails.map((email) => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 60 }],
        },
      },
    });
    return { eventId: res.data.id || null };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Calendar event creation failed:", message);
    return { eventId: null, error: message };
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
    });
    return true;
  } catch (e: unknown) {
    console.error("Calendar event deletion failed:", e);
    return false;
  }
}

export async function deleteMultipleCalendarEvents(
  eventIds: string[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const eventId of eventIds) {
    const success = await deleteCalendarEvent(eventId);
    if (success) deleted++;
    else failed++;
  }
  return { deleted, failed };
}
