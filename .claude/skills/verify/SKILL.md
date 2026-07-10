# Verify: run and drive the Review365 web app

## Launch

```bash
bun install                     # workspace root
cd apps/web && bun run dev      # serves http://localhost:5173
```

## Drive with Playwright

Chromium in this kind of remote env lives outside the version Playwright
expects — point at the pre-installed binary instead of downloading:

```ts
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", // or readlink -f /opt/pw-browsers/chromium
});
```

For the repo's own e2e suite, temporarily add
`launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH }` to
`apps/web/playwright.config.ts` `use:` and run
`PW_CHROMIUM_PATH=... bun run test:e2e` (revert the config after).

## Seed a board without real GitHub

Copy the `seedAuth` + `mockGitHub` helpers from `apps/web/e2e/board.e2e.ts`:
localStorage keys `review365:token` / `review365:login` / `review365:board`,
plus `page.route("https://api.github.com/**", ...)` fulfilling
`/repos/<repo>/pulls`, `/search/issues`, and `/repos/.../pulls/<n>/reviews`.

## Gotchas

- Card selector: `div[draggable='true']` — a bare `[draggable='true']` also
  matches the column drag-handle `<button>`s (⠿).
- Real HTML5 drag works with `mouse.down()` → `mouse.move(..., { steps: N })`
  → `mouse.up()`. Synthetic `locator.dispatchEvent('dragover', { dataTransfer })`
  (with `page.evaluateHandle(() => new DataTransfer())`) also works but does
  NOT fire `dragleave` on elements the pointer leaves — lingering-highlight
  "bugs" seen that way are usually test artifacts; confirm with a real drag.
- Always test the "drag, hold still, release" path: layout shifts under a
  stationary pointer change the drop target mid-drag and have broken drop
  before (see the cancelled-`dragenter` comment in `KanbanColumn.svelte`).
