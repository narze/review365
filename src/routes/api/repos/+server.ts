import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { fetchOwnedRepos } from '$lib/server/github';

export async function GET({ url }: RequestEvent) {
	const token = env.GITHUB_TOKEN;
	const user = env.GITHUB_USER || 'narze';
	const q = url.searchParams.get('q') ?? '';

	if (!token) return json({ error: 'GITHUB_TOKEN not set' }, { status: 500 });

	const repos = await fetchOwnedRepos(token, user, q);
	return json({ repos });
}
