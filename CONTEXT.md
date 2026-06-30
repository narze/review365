# Review365

A Kanban board for tracking GitHub PR reviews across your repos. Polls GitHub, filters by a repo watchlist, and persists board state locally.

## Language

**PR Card**:
A GitHub pull request displayed on the board. Has a repo, number, title, author, and a column it belongs to.
_Avoid_: Issue, ticket, item

**Column**:
A named stage in the review lifecycle (To Review, In Review, Revisions, Awaiting Approval, Approved, Merged). Cards move between columns via drag-drop.
_Avoid_: Lane, swimlane, status

**Board State**:
The persisted mapping of each PR Card to its Column, plus the repo watchlist. Stored as a single JSON document.
_Avoid_: Board config, board settings

**Watchlist**:
An opt-in set of repos. Only PRs from repos in the watchlist are visible on the board. Adding a repo makes its PRs appear; removing a repo erases its cards' column positions.
_Avoid_: Filter, repo filter, enabled repos

**Repo**:
A GitHub repository identified by its full name (`owner/name`). Can be user-owned or org-owned.
_Avoid_: Project, repository (use the shorter form)
