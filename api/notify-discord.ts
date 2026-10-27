type NotifyPayload = {
  ign?: unknown;
  rank?: unknown;
  role?: unknown;
  mode?: unknown;
  code?: unknown;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

function safeField(value: unknown, fallback = 'Not provided'): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.replace(/[@*_~|\`]/g, '').slice(0, 150);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const webhookUrl = runtime.process?.env?.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(200).json({ sent: false, configured: false });
  }

  const input = (req.body ?? {}) as NotifyPayload;
  if (typeof input.ign !== 'string' || !input.ign.trim() ||
      typeof input.code !== 'string' || !input.code.trim()) {
    return res.status(400).json({ error: 'Missing notification fields' });
  }

  try {
    const discordResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: 'New ASy Clan Recruitment Application',
          color: 15117626,
          fields: [
            { name: 'IGN', value: safeField(input.ign), inline: true },
            { name: 'Rank', value: safeField(input.rank), inline: true },
            { name: 'Main role', value: safeField(input.role), inline: true },
            { name: 'Mode', value: safeField(input.mode), inline: true },
            { name: 'Application code', value: safeField(input.code), inline: true },
          ],
          footer: { text: 'ASYLUM COMMUNITY RECRUITMENT • Review in the private recruiter desk' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!discordResponse.ok) {
      console.error('Discord recruitment notification failed with status', discordResponse.status);
      return res.status(502).json({ sent: false, configured: true });
    }

    return res.status(200).json({ sent: true, configured: true });
  } catch (error) {
    console.error('Discord recruitment notification request failed', error);
    return res.status(502).json({ sent: false, configured: true });
  }
}
