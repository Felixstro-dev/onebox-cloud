// Focus a form control once it is mounted. Used instead of the autofocus
// attribute, which browsers and assistive technology handle inconsistently.
export function autofocus(node) {
  const frame = requestAnimationFrame(() => node.focus());
  return {
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
