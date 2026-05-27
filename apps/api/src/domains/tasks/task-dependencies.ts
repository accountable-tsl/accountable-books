import type { BlockerSeverity, TaskTypeCode } from './task-registry.js';

// ── Dependency edge ──────────────────────────────────────────────────

type DependencyEdge = {
  upstream: TaskTypeCode;
  downstream: TaskTypeCode;
  severity: BlockerSeverity;
};

/**
 * The dependency graph. Each edge says:
 *   "upstream must be completed before downstream can proceed"
 *   with the given severity (hard = blocks completion, warning = flags risk).
 *
 * ```
 * reconnect_bank ──hard──▸ categorize_transactions
 * categorize_transactions ──hard──▸ prepare_period_for_review
 * review_ai_categorizations ──hard──▸ prepare_period_for_review
 * review_draft_journals ──warning──▸ prepare_period_for_review
 * respond_to_queries ──warning──▸ prepare_period_for_review
 * prepare_period_for_review ──hard──▸ request_review
 * request_review ──hard──▸ approve_period
 * approve_period ──hard──▸ send_reports
 * send_reports ──hard──▸ close_period
 * ```
 */
const EDGES: DependencyEdge[] = [
  {
    upstream: 'reconnect_bank',
    downstream: 'categorize_transactions',
    severity: 'hard',
  },
  {
    upstream: 'categorize_transactions',
    downstream: 'prepare_period_for_review',
    severity: 'hard',
  },
  {
    upstream: 'review_ai_categorizations',
    downstream: 'prepare_period_for_review',
    severity: 'hard',
  },
  {
    upstream: 'review_draft_journals',
    downstream: 'prepare_period_for_review',
    severity: 'warning',
  },
  {
    upstream: 'respond_to_queries',
    downstream: 'prepare_period_for_review',
    severity: 'warning',
  },
  {
    upstream: 'prepare_period_for_review',
    downstream: 'request_review',
    severity: 'hard',
  },
  {
    upstream: 'request_review',
    downstream: 'approve_period',
    severity: 'hard',
  },
  { upstream: 'approve_period', downstream: 'send_reports', severity: 'hard' },
  { upstream: 'send_reports', downstream: 'close_period', severity: 'hard' },
];

// ── Lookup indexes ───────────────────────────────────────────────────

type UpstreamEntry = {
  upstream: TaskTypeCode;
  severity: BlockerSeverity;
};

const upstreamsByDownstream = new Map<TaskTypeCode, UpstreamEntry[]>();
const downstreamsByUpstream = new Map<TaskTypeCode, TaskTypeCode[]>();

for (const edge of EDGES) {
  const existing = upstreamsByDownstream.get(edge.downstream) ?? [];
  existing.push({ upstream: edge.upstream, severity: edge.severity });
  upstreamsByDownstream.set(edge.downstream, existing);

  const ds = downstreamsByUpstream.get(edge.upstream) ?? [];
  ds.push(edge.downstream);
  downstreamsByUpstream.set(edge.upstream, ds);
}

/**
 * For a given task type, returns which upstream task types must be
 * completed before it, along with their blocker severity.
 */
export function getUpstreamDependencies(
  taskType: TaskTypeCode,
): ReadonlyArray<UpstreamEntry> {
  return upstreamsByDownstream.get(taskType) ?? [];
}

/**
 * For a given task type, returns which downstream task types it blocks.
 */
export function getDownstreamDependents(
  taskType: TaskTypeCode,
): ReadonlyArray<TaskTypeCode> {
  return downstreamsByUpstream.get(taskType) ?? [];
}

/**
 * Returns all edges in the dependency graph.
 */
export function getAllEdges(): ReadonlyArray<DependencyEdge> {
  return EDGES;
}

// ── Cycle detection ──────────────────────────────────────────────────

/**
 * Validates the dependency graph has no cycles.
 * Throws if a cycle is detected.
 * Call at startup or in tests.
 */
export function validateNoCycles(): void {
  const allNodes = new Set<TaskTypeCode>();
  for (const edge of EDGES) {
    allNodes.add(edge.upstream);
    allNodes.add(edge.downstream);
  }

  const visited = new Set<TaskTypeCode>();
  const inStack = new Set<TaskTypeCode>();

  function dfs(node: TaskTypeCode, path: TaskTypeCode[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      throw new Error(`Dependency cycle detected: ${cycle.join(' → ')}`);
    }
    if (visited.has(node)) return;

    inStack.add(node);
    path.push(node);

    for (const downstream of downstreamsByUpstream.get(node) ?? []) {
      dfs(downstream, [...path]);
    }

    inStack.delete(node);
    visited.add(node);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }
}

// ── Topological sort ─────────────────────────────────────────────────

/**
 * Returns task types in dependency order (upstreams before downstreams).
 * Useful for determining evaluation order.
 */
export function topologicalOrder(): TaskTypeCode[] {
  const inDegree = new Map<TaskTypeCode, number>();
  const allNodes = new Set<TaskTypeCode>();

  for (const edge of EDGES) {
    allNodes.add(edge.upstream);
    allNodes.add(edge.downstream);
  }

  for (const node of allNodes) {
    inDegree.set(node, 0);
  }

  for (const edge of EDGES) {
    inDegree.set(edge.downstream, (inDegree.get(edge.downstream) ?? 0) + 1);
  }

  const queue: TaskTypeCode[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  const result: TaskTypeCode[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const downstream of downstreamsByUpstream.get(node) ?? []) {
      const newDegree = (inDegree.get(downstream) ?? 1) - 1;
      inDegree.set(downstream, newDegree);
      if (newDegree === 0) queue.push(downstream);
    }
  }

  return result;
}
