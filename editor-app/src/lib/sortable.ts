export function moveId(ids: string[], movingId: string, overId: string, before: boolean): string[] {
  if (movingId === overId || !ids.includes(movingId) || !ids.includes(overId)) return ids;
  const without = ids.filter((id) => id !== movingId);
  const overIndex = without.indexOf(overId);
  without.splice(before ? overIndex : overIndex + 1, 0, movingId);
  return without;
}
