/** Keep ticks in the order they were made: new ticks go to the end, unticks drop out (QA U2-02). */
export function togglePicks(order: string[], next: Record<string, boolean>): string[] {
  const kept = order.filter((id) => next[id]);
  const added = Object.keys(next).filter((id) => next[id] && !order.includes(id));
  return [...kept, ...added];
}
