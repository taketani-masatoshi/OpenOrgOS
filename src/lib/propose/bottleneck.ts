export type StuckItem = { id: string; ownerId: string; waitingSince: string; kind: string };

export function scanBottlenecks(
  items: StuckItem[],
  asOf: string,
  stuckDays: number,
): Array<StuckItem & { stuckDays: number; notice: { text: string; notified: false } }> {
  const today = Date.parse(`${asOf}T00:00:00Z`);
  return items
    .map((item) => {
      const since = Date.parse(`${item.waitingSince}T00:00:00Z`);
      const days = Math.floor((today - since) / 86_400_000);
      return {
        ...item,
        stuckDays: days,
        notice: {
          text: `${item.id} は ${days} 日止まっています。通知は人間の承認後です。`,
          notified: false as const,
        },
      };
    })
    .filter((item) => item.stuckDays >= stuckDays)
    .sort((a, b) => b.stuckDays - a.stuckDays);
}
