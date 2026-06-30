export async function load({ fetch }) {
	const res = await fetch('/api/prs');
	const { columns, cards } = await res.json();
	return { columns, cards };
}
