export type DueItem = { id: string; dueOn: string; kind: string };

export function scanFollowups(
  items: DueItem[],
  asOf: string,
  withinDays: number,
): Array<DueItem & { draft: string; sent: false }> {
  const start = Date.parse(`${asOf}T00:00:00Z`);
  const end = start + withinDays * 86_400_000;
  return items
    .filter((item) => {
      const due = Date.parse(`${item.dueOn}T00:00:00Z`);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((item) => ({
      ...item,
      draft: `${item.id} の期日は ${item.dueOn} です。送信は人間の承認後です。`,
      sent: false as const,
    }));
}
