import type {
  GetJournalResponse,
  GetRecurringTemplateResponse,
} from '@accountable-books/contracts/schema';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  Copy,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';

export type JournalAction = 'edit' | 'post' | 'void' | 'copy' | 'reverse';
export type TemplateAction =
  | 'edit'
  | 'activate'
  | 'delete'
  | 'pause'
  | 'resume'
  | 'close'
  | 'run_now'
  | 'copy';

type ActionConfig<TAction extends string> = {
  action: TAction;
  id: TAction;
  key: TAction;
  label: string;
  icon: LucideIcon;
  className?: string;
};

export type JournalActionConfig = ActionConfig<JournalAction>;
export type TemplateActionConfig = ActionConfig<TemplateAction>;

function createActionConfig<TAction extends string>(
  action: TAction,
  options: Omit<ActionConfig<TAction>, 'action' | 'id' | 'key'>,
): ActionConfig<TAction> {
  return {
    action,
    id: action,
    key: action,
    ...options,
  };
}

// Action definitions (UI concerns)
const JOURNAL_ACTION_CONFIG: Record<JournalAction, JournalActionConfig> = {
  edit: createActionConfig('edit', { label: 'Edit', icon: Pencil }),
  post: createActionConfig('post', { label: 'Post', icon: Check }),
  void: createActionConfig('void', {
    label: 'Void',
    icon: Trash2,
    className: 'text-destructive',
  }),
  copy: createActionConfig('copy', { label: 'Copy', icon: Copy }),
  reverse: createActionConfig('reverse', {
    label: 'Reverse',
    icon: RotateCcw,
  }),
};

const TEMPLATE_ACTION_CONFIG: Record<TemplateAction, TemplateActionConfig> = {
  edit: createActionConfig('edit', { label: 'Edit', icon: Pencil }),
  activate: createActionConfig('activate', { label: 'Activate', icon: Play }),
  delete: createActionConfig('delete', {
    label: 'Delete',
    icon: Trash2,
    className: 'text-destructive',
  }),
  pause: createActionConfig('pause', { label: 'Pause', icon: Pause }),
  resume: createActionConfig('resume', { label: 'Resume', icon: Play }),
  close: createActionConfig('close', {
    label: 'Close',
    icon: X,
    className: 'text-destructive',
  }),
  run_now: createActionConfig('run_now', { label: 'Run now', icon: Send }),
  copy: createActionConfig('copy', { label: 'Copy', icon: Copy }),
};

// Business rules (all journal logic in one place)
type JournalRule = {
  predicate: (journal: GetJournalResponse['journal']) => boolean;
  actions: readonly JournalAction[];
};

type TemplateRule = {
  predicate: (template: GetRecurringTemplateResponse['template']) => boolean;
  actions: readonly TemplateAction[];
};

// Rules are evaluated in order - first matching rule wins
// Ensure rules are mutually exclusive
const JOURNAL_RULES: readonly JournalRule[] = [
  {
    predicate: (j) => j.status === 'draft',
    actions: ['edit', 'post', 'void', 'copy'],
  },
  {
    predicate: (j) =>
      j.status === 'posted' &&
      Boolean(j.ledgerTransactionId) &&
      j.reversalJournalId == null &&
      j.reversedAt == null,
    actions: ['reverse', 'copy'],
  },
  {
    predicate: (j) => j.status === 'posted' && !j.ledgerTransactionId,
    actions: ['copy'],
  },
  {
    predicate: (j) => j.status === 'reversed',
    actions: ['copy'],
  },
  {
    predicate: (j) => j.status === 'voided',
    actions: ['copy'],
  },
  {
    predicate: () => true, // Catch-all
    actions: [] as const, // No actions by default
  },
] as const;

const TEMPLATE_RULES: readonly TemplateRule[] = [
  {
    predicate: (t) => t.status === 'draft',
    actions: ['activate', 'delete'],
  },
  {
    predicate: (t) => t.status === 'active',
    actions: ['run_now', 'pause', 'close'],
  },
  {
    predicate: (t) => t.status === 'paused',
    actions: ['resume', 'close'],
  },
  {
    predicate: (t) => t.status === 'closed',
    actions: ['copy'],
  },
] as const;

// Public API
export function getAllowedActionsForJournal(
  journal: GetJournalResponse['journal'] | null,
): readonly JournalActionConfig[] {
  if (!journal) return [];

  const matchingRule = JOURNAL_RULES.find((rule) => rule.predicate(journal));
  if (!matchingRule && import.meta.env.DEV) {
    console.error('[BUSINESS_RULES_ERROR] No matching rule for journal', {
      status: journal.status,
      hasReversalId: Boolean(journal.reversalJournalId),
      hasReversedAt: Boolean(journal.reversedAt),
      hasLedgerTxId: Boolean(journal.ledgerTransactionId),
    });

    return [];
  }

  return (matchingRule?.actions ?? []).map(
    (action) => JOURNAL_ACTION_CONFIG[action],
  );
}

export function getAllowedActionsForTemplate(
  template: GetRecurringTemplateResponse['template'] | null,
): readonly TemplateActionConfig[] {
  if (!template) return [];

  const matchingRule = TEMPLATE_RULES.find((rule) => rule.predicate(template));

  if (!matchingRule && import.meta.env.DEV) {
    console.error('[BUSINESS_RULES_ERROR] No matching rule for template', {
      status: template.status,
    });

    return [];
  }

  return (matchingRule?.actions ?? []).map(
    (action) => TEMPLATE_ACTION_CONFIG[action],
  );
}
