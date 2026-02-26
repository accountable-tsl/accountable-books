import { useEffect, useMemo, useState } from 'react';
import { AiAssistButton } from '@/components/ai/ai-assist-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aiRuntimeStore } from '@/modules/ai';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { ChevronLeft, ChevronRight, RefreshCcw, X } from 'lucide-react';

import { InsightsChartsSection } from '../../insights/charts';
import { buildIncomeInsightsCharts } from './insights-mapper';

import type { ReportPeriod } from '../../report-period';
import type { StatementLine } from '../shared/statement-types';

type Insight = {
  id: string;
  headline: string;
  evidence: string;
  aiPrompt: string;
};

type InsightMeta = {
  generatedAtMs: number;
  fingerprint: string;
};

// Mock staleness threshold for UI behavior.
// Production: staleness should be derived from a server-side "booksVersion"/"lastMaterialChangeAt"
// and the last successful insight generation for the same (company, statement, period, compare, basis).
const STALE_MS = 12 * 60 * 60 * 1000;

function clampIndex(value: number, len: number) {
  if (len <= 0) return 0;
  return ((value % len) + len) % len;
}

function formatUpdatedAt(ms: number) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function getMockInsights(opexRatio: number, periodLabel: string): Insight[] {
  return [
    {
      id: 'rev_growth',
      headline: 'Revenue up 14.5% vs prior period',
      evidence:
        'Strongest gain in 6 months. Driven by Consulting Services (+$11.3K) and a new enterprise license deal.',
      aiPrompt: `Explain why revenue increased in ${periodLabel}. Show the top contributing accounts and supporting transactions.`,
    },
    {
      id: 'mkt_spend',
      headline: 'Marketing spend up 37.5% without proportional lift',
      evidence:
        'Digital advertising increased $2.6K and events spend rose $1.6K. Consider reviewing campaign ROI.',
      aiPrompt: `Explain the marketing spend increase in ${periodLabel}. Show the accounts and transactions behind the change, and call out any anomalies.`,
    },
    {
      id: 'margin',
      headline: 'Gross margin improved 2.3pts',
      evidence:
        'Direct labor costs stabilized while service revenue mix increased.',
      aiPrompt: `Explain the gross margin change in ${periodLabel}. Break down revenue and cost of sales drivers with supporting evidence.`,
    },
    {
      id: 'opex_ratio',
      headline: `OpEx now ${opexRatio.toFixed(1)}% of revenue`,
      evidence:
        'Operating costs are rising faster than revenue. Review the largest expense drivers this period.',
      aiPrompt: `Explain the operating expenses ratio in ${periodLabel}. Identify the largest drivers and supporting transactions.`,
    },
  ];
}

function ProgressPip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'block rounded-full transition-[width,background-color] duration-200',
        active ? 'bg-foreground/60 h-1 w-4' : 'bg-muted-foreground/30 h-1 w-1',
      )}
      aria-hidden
    />
  );
}

export function InsightsPanel({
  opexRatio,
  storageKey,
  periodLabel,
  currencyCode,
  period,
  statementLines,
}: {
  opexRatio: number;
  storageKey: string;
  periodLabel: string;
  currencyCode?: string;
  period: ReportPeriod;
  statementLines: StatementLine[];
}) {
  const [hidden, setHidden] = useLocalStorage<boolean>(storageKey, false);
  const [runId, setRunId] = useState(0);
  const [index, setIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const baseInsights = useMemo(
    () => getMockInsights(opexRatio, periodLabel),
    [opexRatio, periodLabel],
  );

  // MOCK "data fingerprint" used to decide whether insights are stale.
  // Production: replace this with a canonical key:
  // - `periodKey` (not display label)
  // - `basis` + `compareMode`
  // - and most importantly `booksVersion` for the period (incremented on postings/sync/categorization).
  // The UI should request insights for (companyId, statement, periodKey, compareKey, basisKey, booksVersion).
  const fingerprint = useMemo(() => {
    const roundedOpex = Math.round(opexRatio * 10) / 10;
    return JSON.stringify({ periodLabel, roundedOpex });
  }, [periodLabel, opexRatio]);

  // MOCK persistence: stores "last generated" metadata client-side.
  // Production: the server should return `generatedAt` and a `booksVersion` (or `fingerprint`)
  // alongside the insight payload. Client storage is only for prototyping.
  const metaKey = useMemo(
    () => `${storageKey}:meta:${encodeURIComponent(periodLabel)}`,
    [storageKey, periodLabel],
  );

  const [meta, setMeta] = useLocalStorage<InsightMeta>(metaKey, {
    generatedAtMs: 0,
    fingerprint: '',
  });

  // Simple refresh behavior: rotate the list order.
  const insights = useMemo(() => {
    const len = baseInsights.length;
    if (len === 0) return [];
    const start = runId % len;
    return Array.from(
      { length: len },
      (_, i) => baseInsights[(start + i) % len],
    );
  }, [baseInsights, runId]);

  const safeIndex = clampIndex(index, insights.length || 1);
  const current = insights[safeIndex] ?? null;

  const isStale =
    !meta.generatedAtMs || Date.now() - meta.generatedAtMs > STALE_MS;

  const updatedAtLabel = formatUpdatedAt(meta.generatedAtMs);
  const chartPayload = useMemo(
    () =>
      buildIncomeInsightsCharts({
        period,
        periodLabel,
        currencyCode,
        statementLines,
      }),
    [period, periodLabel, currencyCode, statementLines],
  );

  const regenerate = (nextFingerprint: string) => {
    // MOCK regeneration.
    // Production: call an API to fetch cached insights or kick off a background job.
    // UI behavior:
    // - If cached for latest booksVersion: return immediately.
    // - Else: show "Updating…" while generation runs; optionally stream partial results.
    // - Only show a manual "Update" control when stale, errored, or generation is taking too long.
    if (isGenerating) return;
    setIsGenerating(true);
    // Simulate model latency and update timestamp + ordering.
    window.setTimeout(() => {
      setMeta({ generatedAtMs: Date.now(), fingerprint: nextFingerprint });
      setRunId((v) => v + 1);
      setIndex(0);
      setIsGenerating(false);
    }, 650);
  };

  // Auto-regenerate when the underlying "data fingerprint" changes or insights go stale.
  useEffect(() => {
    if (hidden) return;
    if (meta.fingerprint !== fingerprint) {
      regenerate(fingerprint);
      return;
    }
    if (isStale) {
      regenerate(fingerprint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, hidden]);

  const handleAi = () => {
    if (!current) return;
    aiRuntimeStore.getState().setInput(current.aiPrompt);
    aiRuntimeStore.getState().open();
  };

  if (hidden) {
    return (
      <div className="flex flex-1 flex-col justify-center p-4">
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setHidden(false)}
        >
          Show insights
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1">
      <div className="bg-muted/30 flex h-45 shrink-0 flex-col gap-2 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Insights</p>
            <p className="text-muted-foreground mt-0.5 text-[10px]">
              {isGenerating
                ? 'Updating…'
                : updatedAtLabel
                  ? `Updated ${updatedAtLabel}`
                  : ' '}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {(isStale || isGenerating) && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7"
                onClick={() => regenerate(fingerprint)}
                aria-label="Update insights"
                disabled={isGenerating}
              >
                <RefreshCcw
                  className={cn('size-3.5', isGenerating && 'animate-spin')}
                />
              </Button>
            )}
            <AiAssistButton
              onClick={handleAi}
              label=""
              ariaLabel="Ask about this insight"
              title="Ask about this insight"
              className="text-muted-foreground hover:bg-accent hover:text-foreground size-7 justify-center rounded-md p-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              onClick={() => setHidden(true)}
              aria-label="Hide insights"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="h-18 overflow-y-auto">
          <p className="text-foreground line-clamp-2 text-sm leading-snug font-medium">
            {current?.headline ?? 'No insights yet.'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {current?.evidence ?? ''}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {insights.map((_, i) => (
              <button
                key={i}
                type="button"
                className="rounded p-1"
                onClick={() => setIndex(i)}
                aria-label={`Insight ${i + 1}`}
              >
                <ProgressPip active={i === safeIndex} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              onClick={() =>
                setIndex((v) => clampIndex(v - 1, insights.length || 1))
              }
              aria-label="Previous insight"
              disabled={insights.length <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              onClick={() =>
                setIndex((v) => clampIndex(v + 1, insights.length || 1))
              }
              aria-label="Next insight"
              disabled={insights.length <= 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <InsightsChartsSection payload={chartPayload} />
    </div>
  );
}
