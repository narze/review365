/** Moves a popover to the document body so scroll containers cannot clip it. */
export function portal(node: HTMLElement) {
  const originalParent = node.parentNode;
  document.body.appendChild(node);

  return {
    destroy() {
      originalParent?.appendChild(node);
    },
  };
}
