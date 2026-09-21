export function analyzeFieldTime(
  rows: Array<{ staffId: string; minutes: number; travelMinutes: number }>,
): {
  totalMinutes: number;
  travelMinutes: number;
  suggestion: string;
  note: { observation: string; ordered: false };
} {
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const travelMinutes = rows.reduce((sum, row) => sum + row.travelMinutes, 0);
  const suggestion =
    travelMinutes > totalMinutes / 2
      ? "移動が作業時間の半分を超えています。近接するジョブを同じ担当案にまとめてください。"
      : "移動比率は半分以下です。割当案の見直しは必須ではありません。";
  return {
    totalMinutes,
    travelMinutes,
    suggestion,
    note: { observation: suggestion, ordered: false },
  };
}
