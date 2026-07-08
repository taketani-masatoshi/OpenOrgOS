import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const psProjectsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      client: z.string().optional(),
      status: z.enum(["draft", "active", "on_hold", "closed"]),
      start_date: isoDate.optional(),
      end_date: isoDate.optional(),
      contract_id: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const saasSubscriptionsFileSchema = z.object({
  subscriptions: z.array(
    z.object({
      id: z.string(),
      account_id: z.string(),
      plan_id: z.string(),
      status: z.enum(["trial", "active", "past_due", "cancelled"]),
      started_on: isoDate,
      renews_on: isoDate.optional(),
    })
  ),
});

export const saasPlansFileSchema = z.object({
  plans: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price_yen: z.number().nonnegative().optional(),
      mrr_yen: z.number().nonnegative().optional(),
      billing_cycle: z.enum(["monthly", "annual"]).optional(),
      trial_days: z.number().int().nonnegative().optional(),
      status: z.enum(["active", "inactive"]).optional(),
    })
  ),
});

export const pmServiceRequestsFileSchema = z.object({
  service_requests: z.array(
    z.object({
      id: z.string(),
      pm_property_id: z.string(),
      type: z.string(),
      title: z.string(),
      reported_date: isoDate,
      status: z.enum(["open", "in_progress", "closed"]),
      sla_due: isoDate.optional(),
    })
  ),
});

export const pmManagementContractsFileSchema = z.object({
  management_contracts: z.array(
    z.object({
      id: z.string(),
      property_id: z.string().optional(),
      pm_property_id: z.string().optional(),
      contract_id: z.string().optional(),
      fee_schedule_id: z.string().optional(),
      fee_type: z.string().optional(),
      fee_rate_pct: z.number().optional(),
      status: z.enum(["draft", "active", "executed", "terminated"]),
      start_date: isoDate.optional(),
    })
  ),
});

export const swMilestonesFileSchema = z.object({
  milestones: z.array(
    z.object({
      id: z.string(),
      sow_id: z.string(),
      name: z.string(),
      due_date: isoDate,
      status: z.enum(["planned", "in_progress", "done", "blocked"]),
      payment_pct: z.number().min(0).max(100).optional(),
    })
  ),
});

export const swTimesheetsFileSchema = z.object({
  timesheets: z.array(
    z.object({
      id: z.string(),
      sow_id: z.string(),
      month: z.string().optional(),
      period: z.string().optional(),
      engineer: z.string().optional(),
      hours: z.number().nonnegative(),
      billable: z.boolean().optional(),
      status: z.enum(["draft", "submitted", "approved"]),
    })
  ),
});

export const brokerageDealsFileSchema = z.object({
  deals: z.array(
    z.object({
      id: z.string(),
      listing_id: z.string(),
      mediation_type: z.string().optional(),
      status: z.enum(["lead", "negotiating", "contracted", "closed", "lost"]),
      important_matters_id: z.string().optional().nullable(),
      contract_id: z.string().optional().nullable(),
      notes: z.string().optional(),
    })
  ),
});

export const vcFundsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  funds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      vintage_year: z.number().int().optional(),
      target_size_jpy: z.number().nonnegative().optional(),
      committed_jpy: z.number().nonnegative().optional(),
      called_jpy: z.number().nonnegative().optional(),
      status: z.enum(["fundraising", "investing", "harvesting", "closed"]),
    })
  ),
});

export const vcPortfolioFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  companies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      fund_id: z.string(),
      stage: z.string().optional(),
      sector: z.string().optional(),
      invested_jpy: z.number().nonnegative().optional(),
      fair_value_jpy: z.number().nonnegative().optional(),
      ownership_pct: z.number().optional(),
      status: z.enum(["active", "exited", "written_off"]).optional(),
      stakeholder_id: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const membershipMembersFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  members: z.array(
    z.object({
      id: z.string(),
      plan_id: z.string(),
      join_date: isoDate,
      status: z.enum(["active", "paused", "cancelled", "expired"]),
      last_checkin: isoDate.optional(),
      renews_on: isoDate.optional(),
    })
  ),
});

export const membershipPlansFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  plans: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      monthly_yen: z.number().nonnegative(),
      checkin_limit: z.union([z.literal("unlimited"), z.number().int().positive()]).optional(),
      status: z.enum(["active", "inactive"]).optional(),
    })
  ),
});

export const swSowContractsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  sow_contracts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      client: z.string().optional(),
      contract_id: z.string().optional(),
      status: z.enum(["draft", "active", "completed", "terminated"]).optional(),
      start_date: isoDate.optional(),
      end_date: isoDate.optional(),
      stack: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const staffingAssignmentsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  assignments: z.array(
    z.object({
      id: z.string(),
      staff_id: z.string(),
      client_id: z.string(),
      start_date: isoDate,
      end_date: isoDate.optional(),
      bill_rate_yen: z.number().nonnegative().optional(),
      status: z.enum(["active", "completed", "cancelled"]),
    })
  ),
});

export const ecommerceOrdersFileSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      customer_id: z.string(),
      lines: z.array(
        z.object({
          sku_id: z.string(),
          qty: z.number().int().positive(),
          unit_price_yen: z.number().nonnegative(),
        })
      ),
      status: z.enum(["pending", "paid", "fulfilled", "cancelled", "returned"]),
      ordered_on: isoDate,
    })
  ),
});

export const eventOpsEventsFileSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      client: z.string().optional(),
      date: isoDate,
      budget_yen: z.number().nonnegative().optional(),
      status: z.enum(["planning", "confirmed", "in_progress", "completed", "cancelled"]),
      venue_ref: z.string().optional(),
    })
  ),
});

export const eventOpsRunOfShowFileSchema = z.object({
  run_of_show: z.array(
    z.object({
      id: z.string().optional(),
      event_id: z.string(),
      segment: z.string().optional(),
      start_time: z.string().optional(),
      owner: z.string().optional(),
      items: z
        .array(
          z.object({
            time: z.string(),
            activity: z.string(),
            owner: z.string().optional(),
          })
        )
        .optional(),
    })
  ),
});
