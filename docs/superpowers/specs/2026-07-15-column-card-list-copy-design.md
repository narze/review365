# Column Card List Copy

## Goal

Let a reviewer copy every currently visible card in a Kanban column as a Markdown list.

## Interaction

- Each column header has a `Copy list` button.
- Activating the button writes the column's current `visibleCards` to the browser clipboard.
- The copied text has one Markdown-link item per card, in the same order as the column:

  ```md
  - [owner/repo#123 — PR title](https://example.test/pull/123)
  ```

- When archived cards are hidden, they are excluded. When they are shown, they are included.
- A temporary success state confirms that the list was copied. An empty column copies an empty list and reports that no cards were available.

## Implementation

- Keep formatting and clipboard handling inside `KanbanColumn.svelte`, where the column title and filtered cards already exist.
- Use the existing `visibleCards` derived value so export exactly matches the UI.
- Add an accessible button label and a Playwright test covering generated clipboard content.

## Error Handling

- If the browser rejects clipboard access, show a short failure state and do not alter cards or column state.
