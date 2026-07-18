# Discord Notifications

Review365 can ping a Discord channel when a PR card moves into a watched column
(e.g. when automation moves a card to "✅ Approved", or when you drag it to
"Awaiting Approval"). All pings are sent **directly from your browser** — there
is no backend that sees your webhook URL.

## 1. Create a Discord webhook

1. Open Discord → the server and channel that should receive pings
2. Click the **⚙️ Edit Channel** gear next to the channel name
3. **Integrations → Webhooks → New Webhook**
4. Customise:
   - **Name**: anything (Review365 overrides this with your `botName`)
   - **Channel**: the target channel
5. Click **Copy Webhook URL** → looks like
   `https://discord.com/api/webhooks/1234567890/abcDEF…`

## 2. Configure Review365

1. Open Review365 → **⚙️ Settings**
2. In the **🔔 Discord Notifications** section:
   - Paste the webhook URL
   - Optionally set the bot name (defaults to `Review365`)
   - Tick every column that should trigger a ping (multi-select)
3. Click **Send test ping** — a green message appears in Discord
4. Click **Save**

## 3. How triggers work

A ping fires when:

- **You drag a card** into a watched column, OR
- **An automation rule** moves a card into a watched column (e.g. signal
  `approved` → column `approved`)

It does **not** fire when:

- A card already in a watched column gets re-ordered within that column
- A card leaves a watched column
- A refresh runs and the card was already there

## 4. Privacy

- The webhook URL lives in your browser's `localStorage` — same place as your
  board state.
- It is **never** sent to Review365's Pages Functions or any other server.
- The only outbound request is `POST <your-webhook-url>` from your browser to
  Discord.
- Exporting a board backup **does** include the webhook URL (it is part of
  `BoardConfig`). If you share a backup, share the JSON with care.

## 5. Rate limits

Discord caps each webhook at **30 messages per minute**. Review365 sends at
most one ping per card move, so this limit is essentially unreachable for
personal use. If you do hit it, Discord returns HTTP 429 and Review365 silently
skips that ping — the underlying card move always succeeds.

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Test ping says "Failed" | Wrong URL, or webhook deleted in Discord | Re-copy URL from Discord |
| Pings used to work, now silent | Webhook revoked or channel deleted | Recreate webhook |
| Embed looks ugly / no colour | Old Discord client | Update Discord |
| Too noisy | Too many columns watched | Untick some columns in Settings |

## 7. Disabling

Either:
- Open Settings → 🔔 Discord Notifications → **Clear**, or
- Delete the webhook from Discord (Review365 will silently fail next time)
