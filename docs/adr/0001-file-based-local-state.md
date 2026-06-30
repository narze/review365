# File-based local state (no database)

For the initial local-only build, board state persists to a JSON file on disk rather than a database or cloud storage. This avoids pulling in D1/Drizzle/R2 infrastructure before the product shape is settled. When deployment is addressed later, the storage layer can be swapped — but the file format should be designed to map cleanly to a key-value or document store.

The file lives in the project root (`./board.json`) and is gitignored.
