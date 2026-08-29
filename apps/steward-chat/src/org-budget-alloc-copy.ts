import { defineCopy } from "@ops-shared/define-copy";

export const ALLOC_COPY = defineCopy(
  {
    yen: "円",
    unallocated: "未分配",
    distribution: "予算分配",
    colCategory: "費目",
    colBudget: "予算",
    colActual: "実績",
    colRemaining: "残額",
    colAmount: "金額",
    none: "なし",
    refCategories: "参照費目（分配対象外）",
    refCategoriesTip:
      "事業計画・資産台帳など、本画面では分配しない参照費目です。",
    noAllocatableCategories: "分配可能な費目がありません",
    over: "（超過）",
    poolTip: (unallocated: string, over: string, cap: string) =>
      `予算枠の総額は変えず、費目間で再分配します。未分配 ${unallocated}${over}。選択費目の上限 ${cap}。`,
    emptyCategoryAlloc: "費目未分配",
    allocationAmount: "分配額",
    categoryAllocYen: "費目の分配額（円）",
    update: "更新",
    changeEnvelope: "執行枠の変更",
    increaseBlocked:
      "事業計画が未承認のため、執行枠の増額はできません（縮小・枠内再配分は可）。",
    yenOf: (label: string) => `${label}（円）`,
    reason: "理由",
    decisionRef: "決裁参照",
    requestChange: "変更を申請",
    open: "開く",
    close: "閉じる",
    deptAllocTip: (room: string) =>
      `部門予算枠の変更は上位（CEO等）の承認後に反映。上限の目安 ${room}。`,
    deptAllocAmount: "部門分配額",
    pendingApproval: (id: string, amount: string) =>
      `承認待ち ${id} · ${amount} · 上位承認`,
    deptIncreaseBlocked: "事業計画が未承認のため、部門枠の増額はできません。",
    deptAllocYen: (label: string) => `${label}の分配額（円）`,
    deptChangeSubmitted: (label: string) =>
      `${label}の分配額変更を承認に提出しました`,
    noPersonCategories:
      "個人分配可能な費目がありません。先に部門費目へ分配してください。",
    personPoolTip:
      "部門の費目分配額から個人へ再分配します。本人の現行額を含む上限です。",
    allocatable: "分配可能",
    person: "人員",
    personCategoryYen: "個人の費目別分配額（円）",
    allocatedToPerson: "個人へ分配しました",
    planLocked: (status: string) =>
      `事業計画は ${status} のため執行枠の増額はロック中です。枠内の費目・個人再配分は可能です。`,
    actualsSummary: "実績の要約",
    companyEnvelope: "全社予算枠",
    actual: "実績",
    remainingBurn: (burn: string) => `残高（消化 ${burn}）`,
    allocHierarchy: "分配の階層",
    company: "全社",
    personFallback: "個人",
    companyAlloc: "全社の分配",
    companyAllocTip:
      "全社予算枠を部門へ分配します。費目分配は各階層の内側で行います。",
    envelope: "予算枠",
    deptAllocated: "部門分配済",
    deptSlicesTip:
      "部門ごとの分配額です。開くで詳細、分配額で変更申請します。",
    toDepartments: "部門への分配",
    head: (name: string) => `責任者 ${name}`,
    categoryAlloc: "費目分配",
    unallocatedDot: (amount: string) => ` · 未分配 ${amount}`,
    companyCategoryTip: "全社予算枠内の費目再分配です。総額は変わりません。",
    companyCategoryUpdated: "全社の費目分配を更新しました",
    companyEnvelopeHint: "全社予算枠の変更は上位承認後に反映します。",
    companyEnvelopeSubmitted: "全社予算枠の変更承認を提出しました",
    deptAllocLevel: "部門の分配",
    deptToPeopleTip:
      "部門予算枠を個人へ分配します。個人分配できる費目のみ次階層へ進みます。",
    peopleAllocated: "個人分配済",
    toPeopleTip:
      "人員ごとの個人経費枠です。報酬・給与は含めません。開くと費目分配を編集できます。",
    toPeople: "個人への分配",
    overBudget: "経費枠超過",
    deptCategoryTip: "部門予算枠内の費目再分配です。総額は変わりません。",
    unallocatedPrefix: " · 未分配 ",
    deptCategoryUpdated: "部門の費目分配を更新しました",
    deptEnvelopeChange: "部門予算枠の変更",
    deptEnvelopeChangeTip:
      "部門予算枠の増減は上位役職者の承認が必要です。枠内の費目・個人分配は部門責任者が実施できます。",
    personAlloc: "個人の分配",
    personAllocTip: (dept: string) =>
      `${dept}の費目分配額から個人経費枠へ再分配します（役員報酬・給与は対象外）。`,
    allocated: "分配済",
    expenseActual: "経費実績",
    balance: "残高",
    noPersonAllocPermission: "この部門の個人分配を変更する権限がありません",
  },
  {
    yen: "JPY",
    unallocated: "Unallocated",
    distribution: "Budget allocation",
    colCategory: "Category",
    colBudget: "Budget",
    colActual: "Actual",
    colRemaining: "Remaining",
    colAmount: "Amount",
    none: "None",
    refCategories: "Reference categories (not allocated here)",
    refCategoriesTip:
      "Reference items from the business plan or asset register. This screen does not allocate them.",
    noAllocatableCategories: "No allocatable categories",
    over: " (over)",
    poolTip: (unallocated: string, over: string, cap: string) =>
      `Reallocate across categories without changing the envelope total. Unallocated ${unallocated}${over}. Cap for the selected category ${cap}.`,
    emptyCategoryAlloc: "No category allocation",
    allocationAmount: "Allocation",
    categoryAllocYen: "Category allocation (JPY)",
    update: "Update",
    changeEnvelope: "Change envelope",
    increaseBlocked:
      "The business plan is not approved, so the envelope cannot increase (cuts and reallocations inside the envelope are allowed).",
    yenOf: (label: string) => `${label} (JPY)`,
    reason: "Reason",
    decisionRef: "Decision reference",
    requestChange: "Request change",
    open: "Open",
    close: "Close",
    deptAllocTip: (room: string) =>
      `Department envelope changes apply after a higher-level (CEO) approval. Guide cap ${room}.`,
    deptAllocAmount: "Department allocation",
    pendingApproval: (id: string, amount: string) =>
      `Pending ${id} · ${amount} · higher-level approval`,
    deptIncreaseBlocked:
      "The business plan is not approved, so the department envelope cannot increase.",
    deptAllocYen: (label: string) => `${label} allocation (JPY)`,
    deptChangeSubmitted: (label: string) =>
      `Submitted a change request for ${label}`,
    noPersonCategories:
      "No person-allocatable categories. Allocate to department categories first.",
    personPoolTip:
      "Reallocate from the department category to people. The cap includes this person's current amount.",
    allocatable: "Available",
    person: "Person",
    personCategoryYen: "Person category allocation (JPY)",
    allocatedToPerson: "Allocated to the person",
    planLocked: (status: string) =>
      `Envelope increases are locked because the business plan is ${status}. Category and person reallocations inside the envelope are still allowed.`,
    actualsSummary: "Actuals summary",
    companyEnvelope: "Company envelope",
    actual: "Actual",
    remainingBurn: (burn: string) => `Remaining (used ${burn})`,
    allocHierarchy: "Allocation levels",
    company: "Company",
    personFallback: "Person",
    companyAlloc: "Company allocation",
    companyAllocTip:
      "Allocate the company envelope to departments. Category allocation happens inside each level.",
    envelope: "Envelope",
    deptAllocated: "Allocated to departments",
    deptSlicesTip:
      "Allocation by department. Open for detail, Allocation to request a change.",
    toDepartments: "To departments",
    head: (name: string) => `Head ${name}`,
    categoryAlloc: "Category allocation",
    unallocatedDot: (amount: string) => ` · unallocated ${amount}`,
    companyCategoryTip:
      "Reallocate categories inside the company envelope. The total does not change.",
    companyCategoryUpdated: "Updated company category allocation",
    companyEnvelopeHint:
      "Company envelope changes apply after higher-level approval.",
    companyEnvelopeSubmitted: "Submitted a company envelope change for approval",
    deptAllocLevel: "Department allocation",
    deptToPeopleTip:
      "Allocate the department envelope to people. Only person-allocatable categories go to the next level.",
    peopleAllocated: "Allocated to people",
    toPeopleTip:
      "Personal expense envelopes. Excludes compensation and salary. Open to edit category allocation.",
    toPeople: "To people",
    overBudget: "Over envelope",
    deptCategoryTip:
      "Reallocate categories inside the department envelope. The total does not change.",
    unallocatedPrefix: " · unallocated ",
    deptCategoryUpdated: "Updated department category allocation",
    deptEnvelopeChange: "Change department envelope",
    deptEnvelopeChangeTip:
      "Increasing or decreasing the department envelope needs higher-level approval. Category and person allocation inside the envelope can be done by the department head.",
    personAlloc: "Person allocation",
    personAllocTip: (dept: string) =>
      `Reallocate from ${dept} category amounts to a personal expense envelope (officer pay and salary excluded).`,
    allocated: "Allocated",
    expenseActual: "Expense actuals",
    balance: "Balance",
    noPersonAllocPermission:
      "You do not have permission to change person allocation in this department",
  },
);
