import type { BoardStore } from '@review365/api/store';
import type { BoardState } from '@review365/api/types';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function boardFilePath(): string {
	return process.env.BOARD_FILE || join(process.cwd(), '..', '..', 'board.json');
}

export class FileBoardStore implements BoardStore {
	#path: string;

	constructor(path?: string) {
		this.#path = path ?? boardFilePath();
	}

	async load(): Promise<BoardState> {
		try {
			const data = await readFile(this.#path, 'utf-8');
			return JSON.parse(data) as BoardState;
		} catch {
			return { cards: {} };
		}
	}

	async save(state: BoardState): Promise<void> {
		await writeFile(this.#path, JSON.stringify(state, null, 2));
	}
}

export const fileBoardStore = new FileBoardStore();
