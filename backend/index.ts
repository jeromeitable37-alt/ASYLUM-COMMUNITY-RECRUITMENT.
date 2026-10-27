import { router, json, error, secrets } from '@appdeploy/sdk';

export const handler = router({
  'GET /api/_healthcheck': [
    async () => json({ message: 'Success', service: 'ASy Clan Recruitment' }),
  ],
  'POST /api/notify-discord': [
    async ({ body }) => {
      const names = await secrets.listSecretNames();
      if (!names.includes('DISCORD_WEBHOOK_URL')) return json({ sent: false, configured: false });
      let webhook = '';
      try { webhook = await secrets.readSecret('DISCORD_WEBHOOK_URL'); }
      catch { return json({ sent: false, configured: false }); }
      const input = (body ?? {}) as { ign?: string; rank?: string; role?: string; mode?: string; code?: string };
      if (!input.ign || !input.code) return error('Missing notification fields', 400);
      const safe = (value: string | undefined) => (value ?? 'Not provided').replace(/[@*_~|]/g, '').slice(0, 150);
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowed_mentions: { parse: [] },
          embeds: [{
            title: 'New ASy Clan Recruitment Application',
            color: 15117626,
            fields: [
              { name: 'IGN', value: safe(input.ign), inline: true },
              { name: 'Rank', value: safe(input.rank), inline: true },
              { name: 'Main role', value: safe(input.role), inline: true },
              { name: 'Mode', value: safe(input.mode), inline: true },
              { name: 'Application code', value: safe(input.code), inline: true },
            ],
            footer: { text: 'ASy Clan Recruitment • Review in the private recruiter desk' },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (!response.ok) {
        console.warn('Discord recruitment notification failed with status', response.status);
        return json({ sent: false, configured: true });
      }
      return json({ sent: true, configured: true });
    },
  ],
});