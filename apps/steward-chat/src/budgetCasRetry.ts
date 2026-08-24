import { isBudgetRevisionConflict } from "./api";

/**
 * On revision_conflict: refresh local state once, then retry the mutation.
 * Safe because a 409 means our write did not land. Does not loop.
 */
export async function withRevisionConflictRetry<T>(
  mutate: () => Promise<T>,
  reload: () => Promise<void>,
): Promise<T> {
  try {
    return await mutate();
  } catch (error) {
    if (!isBudgetRevisionConflict(error)) throw error;
    await reload();
    return mutate();
  }
}
