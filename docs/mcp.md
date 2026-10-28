# MCP server (let an agent move cards)

`packages/mcp` is a local [MCP](https://modelcontextprotocol.io) server. It lets an AI agent
(Claude Code, Cursor, and so on) read and edit the board that is open in your browser.

The board never leaves the browser. The MCP server runs on your machine and forwards each
tool call over a WebSocket on `127.0.0.1:47365` to the open review365 tab. The tab runs the
call against its own localStorage, the same way as a drag and drop.

```
agent ──stdio──▶ review365 MCP server ──ws://127.0.0.1:47365──▶ review365 tab (localStorage)
```

## Tools

| Tool             | What it does                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| `get_board`      | Columns and their cards in drag order (`include_archived` to add more) |
| `move_card`      | Move a card to a column, at the end or before `before_card_id`         |
| `archive_card`   | Archive a card                                                         |
| `unarchive_card` | Bring an archived card back                                            |
| `set_note`       | Set or clear (empty string) the note on a card, max 200 characters     |

## Set up

1. Install dependencies in this repo: `bun install`.
2. Add the server to your agent. For Claude Code:

   ```bash
   claude mcp add review365 \
     -e REVIEW365_ORIGINS=https://your-review365.vercel.app \
     -- bun /path/to/review365/packages/mcp/src/index.ts
   ```

   `REVIEW365_ORIGINS` is a comma-separated list of the origins where you open review365.
   `http://localhost:5173` is always allowed. The server refuses tabs from any other origin.

3. Open review365, go to **Settings**, and turn on **Connect to local MCP server**.
   The status shows **Connected** while the agent's MCP server runs.

The tab must stay open. When it is closed, the tools return an error that tells the agent so.

## Notes

- Chrome asks once for permission when a site on the internet connects to `localhost`
  ("local network access"). Allow it for review365.
- Only one MCP server can use the port. To run more than one, set `REVIEW365_MCP_PORT`
  for the server and change `port` in the `review365:mcp-bridge` localStorage entry.
- When more than one tab is connected, the most recently connected tab answers.
- Agent edits show as "You" in the activity log.
