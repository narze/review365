import type { RouterClient } from '@orpc/server';
import { z } from 'zod';

import { publicProcedure } from '../index';
import { env } from '@review365/env/server';
import { fetchPRs, fetchOwnedRepos } from '../github';
import {
	getCardColumn,
	setCardColumn,
	getEnabledRepos,
	toggleRepo,
	applyAutomation,
	findOrphanedCards,
	reorderCard,
	archiveCard,
	unarchiveCard
} from '../store';
import {
	addColumn,
	renameColumn,
	deleteColumn,
	reorderColumns,
	addRule,
	deleteRule,
	createDefaultConfig
} from '../config';
import { SIGNAL_LABELS } from '../types';
import type { Signal, ColumnId } from '../types';

const signalSchema = z.enum(Object.keys(SIGNAL_LABELS) as [Signal, ...Signal[]]);

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return 'OK';
	}),

	config: {
		get: publicProcedure.handler(async ({ context }) => {
			return context.configStore.load();
		}),

		columns: {
			add: publicProcedure
				.input(z.object({ title: z.string().min(1) }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = addColumn(config, input.title);
					await context.configStore.save(updated);
					return updated;
				}),

			rename: publicProcedure
				.input(z.object({ id: z.string(), title: z.string().min(1) }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = renameColumn(config, input.id, input.title);
					await context.configStore.save(updated);
					return updated;
				}),

			delete: publicProcedure
				.input(z.object({ id: z.string() }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = deleteColumn(config, input.id);
					await context.configStore.save(updated);
					return updated;
				}),

			reorder: publicProcedure
				.input(z.object({ ids: z.array(z.string()) }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = reorderColumns(config, input.ids);
					await context.configStore.save(updated);
					return updated;
				})
		},

		rules: {
			add: publicProcedure
				.input(z.object({ signal: signalSchema, columnId: z.string() }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = addRule(config, input.signal, input.columnId);
					await context.configStore.save(updated);
					return updated;
				}),

			delete: publicProcedure
				.input(z.object({ id: z.string() }))
				.handler(async ({ input, context }) => {
					const config = await context.configStore.load();
					const updated = deleteRule(config, input.id);
					await context.configStore.save(updated);
					return updated;
				})
		}
	},

	prs: {
		list: publicProcedure.handler(async ({ context }) => {
			const token = env.GITHUB_TOKEN;
			const user = env.GITHUB_USER;
			const config = await context.configStore.load();
			const state = await context.store.load();

			const prs = await fetchPRs(token, user, getEnabledRepos(state));

			// Build signal map for automation
			const cardSignals: Record<string, Signal[]> = {};
			for (const pr of prs) {
				cardSignals[pr.id] = pr.signals;
			}

			// Apply automation rules
			const automatedState = applyAutomation(state, cardSignals, config.rules);

			// Save if anything changed
			const changed = JSON.stringify(automatedState) !== JSON.stringify(state);
			if (changed) {
				await context.store.save(automatedState);
			}

		const cards = prs.map((pr) => ({
			...pr,
			columnId: getCardColumn(automatedState, pr.id),
			archived: automatedState.cards[pr.id]?.archived ?? false
		}));

		const orphans = findOrphanedCards(automatedState, config);

		return {
			columns: config.columns,
			cards,
			enabledRepos: getEnabledRepos(automatedState),
			rules: config.rules,
			orphans,
			signalLabels: SIGNAL_LABELS
		};
		})
	},

	repos: {
		search: publicProcedure
			.input(z.object({ q: z.string().default('') }))
			.handler(async ({ input }) => {
				const token = env.GITHUB_TOKEN;
				const user = env.GITHUB_USER;
				const repos = await fetchOwnedRepos(token, user, input.q);
				return { repos };
			})
	},

	board: {
		getState: publicProcedure.handler(async ({ context }) => {
			return context.store.load();
		}),

		moveCard: publicProcedure
			.input(
				z.object({
					cardId: z.string(),
					column: z.string()
				})
			)
			.handler(async ({ input, context }) => {
				const state = await context.store.load();
				const updated = setCardColumn(state, input.cardId, input.column as ColumnId);
				await context.store.save(updated);
				return updated;
			}),

		toggleRepo: publicProcedure
			.input(z.object({ repo: z.string() }))
			.handler(async ({ input, context }) => {
				const state = await context.store.load();
				const updated = toggleRepo(state, input.repo);
				await context.store.save(updated);
				return updated;
			}),

		reorderCard: publicProcedure
			.input(
				z.object({
					cardId: z.string(),
					targetCardId: z.string().nullable(),
					column: z.string()
				})
			)
			.handler(async ({ input, context }) => {
				const state = await context.store.load();
				const updated = reorderCard(
					state,
					input.cardId,
					input.targetCardId,
					input.column as ColumnId
				);
				await context.store.save(updated);
				return updated;
			}),

		archiveCard: publicProcedure
			.input(z.object({ cardId: z.string() }))
			.handler(async ({ input, context }) => {
				const state = await context.store.load();
				const updated = archiveCard(state, input.cardId);
				await context.store.save(updated);
				return updated;
			}),

		unarchiveCard: publicProcedure
			.input(z.object({ cardId: z.string() }))
			.handler(async ({ input, context }) => {
				const state = await context.store.load();
				const updated = unarchiveCard(state, input.cardId);
				await context.store.save(updated);
				return updated;
			})
	}
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
