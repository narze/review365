import type { ConfigStore, BoardConfig } from '@review365/api/config';
import { createDefaultConfig } from '@review365/api/config';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_FILE = join(process.cwd(), '..', '..', 'board-config.json');

export class FileConfigStore implements ConfigStore {
	async load(): Promise<BoardConfig> {
		try {
			const data = await readFile(CONFIG_FILE, 'utf-8');
			return JSON.parse(data) as BoardConfig;
		} catch {
			return createDefaultConfig();
		}
	}

	async save(config: BoardConfig): Promise<void> {
		await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
	}
}

export const fileConfigStore = new FileConfigStore();
