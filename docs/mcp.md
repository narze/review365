# MCP server (let an agent move cards)

review365 serves an [MCP](https://modelcontextprotocol.io) endpoint at `/api/mcp`. An AI agent
(Claude Code, Cursor, and so on) can use it to read and edit the board that is open in your
browser. Nothing runs on your machine except the browser tab.

The board never leaves the browser. The server only relays: each tool call goes over Redis
pub/sub to the paired tab's command stream, the tab runs it against its own localStorage the
same way as a drag and drop, and the tab posts the result back. Pub/sub keeps no messages.

```
agent ──HTTP──▶ /api/mcp ──Redis pub/sub──▶ /api/bridge/stream (SSE) ──▶ review365 tab
                    ▲                                                        │
                    └──────── Redis pub/sub ◀── /api/bridge/reply ◀──────────┘
```

## Tools

| Tool             | What it does                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| `get_board`      | Columns and their cards in drag order (`include_archived` to add more) |
| `move_card`      | Move a card to a column, at the end or before `before_card_id`         |
| `archive_card`   | Archive a card                                                         |
| `unarchive_card` | Bring an archived card back                                            |
| `set_note`       | Set or clear (empty string) the note on a card, max 200 characters     |

## Use it

1. Open review365, go to **Settings**, and turn on **Allow AI agents to edit this board**.
2. Copy the command shown there and run it. It looks like this:

   ```bash
   claude mcp add --transport http review365 https://<your-app>/api/mcp \
     --header "Authorization: Bearer <pairing token>"
   ```

3. Keep the tab open. When no tab is paired, tools return an error that says so.

The pairing token is made in your browser and links the agent to that browser's board.
Anyone with the token can edit the board while the tab is open, so keep it secret. **New token**
cuts off agents that use the old one.

With several tabs open, only one tab (picked with the Web Locks API) answers.

## Deploy (Vercel)

Vercel can run the MCP call and the tab's stream on different function instances, so they
meet on Redis pub/sub. Add a Redis database to the project (for example Upstash or Redis
Cloud from the Vercel Marketplace) and set `REDIS_URL` (a `redis://` or `rediss://` URL).
Without it, the endpoints answer `503`.

The command stream ends after 270 seconds and the tab reconnects at once, so it fits in the
default function duration with Fluid compute. A shorter limit still works; the tab only
reconnects more often.

Local dev (`bun run dev`) uses an in-memory pub/sub when `REDIS_URL` is not set.
