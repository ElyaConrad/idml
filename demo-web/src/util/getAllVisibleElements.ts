export function getAllVisibleElements(elOrDoc: Element | Document) {
  return Array.from(elOrDoc.querySelectorAll('.element')).filter((el) => el.closest('defs') === null);
}
