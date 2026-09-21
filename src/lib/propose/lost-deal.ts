export function draftLostDealFollowup(input: { dealId: string; silentDays: number }): {
  dealId: string;
  subject: string;
  draft: string;
  sent: false;
  channel: null;
} {
  const subject = `${input.dealId} フォロー文案`;
  return {
    dealId: input.dealId,
    subject,
    draft: `${input.dealId} は ${input.silentDays} 日動きがありません。フォロー文案です。送信は人間の承認後です。`,
    sent: false,
    channel: null,
  };
}
