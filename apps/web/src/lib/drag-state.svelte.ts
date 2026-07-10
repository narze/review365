// Shared state for the card currently being dragged. Lives in a module so
// every column can open a drop gap sized to the real card, even when the
// drag crosses column boundaries (dataTransfer payloads are unreadable
// during dragover, so the card's height must be shared out-of-band).
export const cardDrag = $state<{ cardId: string | null; height: number }>({
	cardId: null,
	height: 0
});

export function startCardDrag(cardId: string, height: number) {
	cardDrag.cardId = cardId;
	cardDrag.height = height;
}

export function endCardDrag() {
	cardDrag.cardId = null;
	cardDrag.height = 0;
}
