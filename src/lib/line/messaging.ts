const LINE_API_BASE = "https://api.line.me/v2/bot";

export async function sendLinePushMessage(
  lineUserIds: string[],
  message: string
): Promise<{ sentTo: string[]; failed: string[] }> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN is not set");
    return { sentTo: [], failed: lineUserIds };
  }

  if (lineUserIds.length === 0) {
    return { sentTo: [], failed: [] };
  }

  try {
    const res = await fetch(`${LINE_API_BASE}/message/multicast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserIds,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (res.ok) {
      return { sentTo: lineUserIds, failed: [] };
    }

    const errBody = await res.json().catch(() => ({}));
    console.error("LINE multicast error:", res.status, JSON.stringify(errBody));
    return { sentTo: [], failed: lineUserIds };
  } catch (e) {
    console.error("LINE multicast exception:", e);
    return { sentTo: [], failed: lineUserIds };
  }
}

export async function sendLineIndividualMessage(
  lineUserId: string,
  message: string
): Promise<boolean> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: message }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
