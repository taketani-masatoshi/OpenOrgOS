import { z } from "zod";

export const edgeCategory = z.enum([
  "data→data",
  "data→docs",
  "data→reports",
  "contract→loan",
  "property→plan",
  "parameter→plan",
  "plan→report",
  "contract→records",
  "operations→docs",
]);

export const nodeCategory = z.enum(["file", "parameter", "report", "queue"]);

export const dependencyAction = z.enum(["review", "sync", "update", "regenerate"]);

export const dependencyNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: nodeCategory.default("file"),
  /** 実ファイルパス（repo ルート相対）。parameter ノードの親ファイルにも使用 */
  path: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

export const dependencyEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  category: edgeCategory,
  reason: z.string().min(1),
  action: dependencyAction.default("review"),
});

export const dependencyGraphSchema = z.object({
  version: z.literal("1"),
  description: z.string().optional(),
  nodes: z.array(dependencyNodeSchema).min(1),
  edges: z.array(dependencyEdgeSchema),
});

export type EdgeCategory = z.infer<typeof edgeCategory>;
export type NodeCategory = z.infer<typeof nodeCategory>;
export type DependencyAction = z.infer<typeof dependencyAction>;
export type DependencyNode = z.infer<typeof dependencyNodeSchema>;
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;
export type DependencyGraph = z.infer<typeof dependencyGraphSchema>;
