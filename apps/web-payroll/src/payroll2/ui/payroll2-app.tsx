import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useNavigate } from '@tanstack/react-router';

import { computeRun } from '../compute/compute-run';
import {
  makeNewEmployeeRecord,
  makeNewPayrollRun,
  makeRunItemFromEmployee,
} from '../domain';
import {
  deleteRun,
  loadCompanyDefaults,
  loadRun,
  loadRunsIndex,
  saveCompanyDefaults,
  saveRun,
} from '../storage';

import type { PayrollRun } from '../domain';

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function useDebouncedEffect(
  effect: () => void,
  delayMs: number,
  deps: unknown[],
) {
  useEffect(() => {
    const handle = window.setTimeout(() => effect(), delayMs);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function isValidMoneyFinal(value: string) {
  return /^\d+(\.\d{1,6})?$/.test(value.trim());
}

function isValidNonEmpty(value: string) {
  return value.trim().length > 0;
}

function runSignature(run: PayrollRun) {
  // Only include user-editable inputs; exclude computed/metadata so autosave doesn't loop.
  const stable = {
    id: run.id,
    rulesetKey: run.rulesetKey,
    companyName: run.companyName,
    periodMonth: run.periodMonth,
    periodYear: run.periodYear,
    status: run.status,
    finalizedAt: run.finalizedAt ?? null,
    settings: run.settings ?? null,
    items: run.items,
    overrides: run.overrides ?? null,
  };
  return JSON.stringify(stable);
}

export function Payroll2App() {
  const navigate = useNavigate();
  const [runsIndex, setRunsIndex] = useState<
    { id: string; label: string; status: 'draft' | 'final' }[]
  >([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftCompanyName, setDraftCompanyName] = useState('');
  const [draftNameById, setDraftNameById] = useState<Record<string, string>>(
    {},
  );
  const [draftAnnualGrossById, setDraftAnnualGrossById] = useState<
    Record<string, string>
  >({});

  const [finalizeOpen, setFinalizeOpen] = useState(false);

  async function refreshRunsList() {
    const index = await loadRunsIndex();
    setRunsIndex(
      index.runs.map((r) => ({
        id: r.id,
        label: `${r.companyName} • ${r.label}`,
        status: r.status,
      })),
    );
  }

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        await refreshRunsList();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeRunId) {
      setRun(null);
      return;
    }

    (async () => {
      try {
        setError(null);
        const loaded = await loadRun(activeRunId);
        setRun(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load run');
      }
    })();
  }, [activeRunId]);

  useEffect(() => {
    if (!run) return;
    setDraftCompanyName(run.companyName);
    setDraftNameById(
      Object.fromEntries(
        run.items.map((i) => [i.id, i.employeeSnapshot.fullName]),
      ),
    );
    setDraftAnnualGrossById(
      Object.fromEntries(
        run.items.map((i) => [
          i.id,
          i.payProfileSnapshot.compensationHistory[0]?.annualGross ?? '',
        ]),
      ),
    );
  }, [run?.id]);

  const computed = useMemo(() => {
    if (!run)
      return {
        value: null as ReturnType<typeof computeRun> | null,
        error: null as string | null,
      };
    try {
      return { value: computeRun(run, { nowIso: run.updatedAt }), error: null };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : 'Compute error',
      };
    }
  }, [run]);

  useEffect(() => {
    if (computed.error) setError(computed.error);
    if (!computed.error && error === 'Compute error') setError(null);
  }, [computed.error]);

  const lastSavedSig = useRef<string | null>(null);

  useDebouncedEffect(
    () => {
      if (!run) return;

      const sig = runSignature(run);
      if (lastSavedSig.current === sig) return;

      void (async () => {
        try {
          const saved = await saveRun(run);
          lastSavedSig.current = sig;
          setRun(saved);
          setError(null);
          await refreshRunsList();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to save run');
        }
      })();
    },
    500,
    [run],
  );

  async function createRun() {
    const defaults = await loadCompanyDefaults();
    const periodYear = 2026;
    const periodMonth = 1;
    const companyName = defaults?.companyName ?? 'Company';

    const newRun = makeNewPayrollRun({
      id: newId(),
      nowIso: nowIso(),
      rulesetKey: 'NG-2026-v1',
      companyName,
      periodMonth,
      periodYear,
    });

    if (defaults?.settings) newRun.settings = defaults.settings;
    const saved = await saveRun(newRun);
    lastSavedSig.current = runSignature(saved);
    setActiveRunId(saved.id);
    setRun(saved);
    setDraftCompanyName(saved.companyName);
    await refreshRunsList();
  }

  async function removeRun(runId: string) {
    await deleteRun(runId);
    if (activeRunId === runId) {
      setActiveRunId(null);
      setRun(null);
    }
    await refreshRunsList();
  }

  async function updateCompanyName(nextName: string) {
    await saveCompanyDefaults({
      companyName: nextName,
      settings: run?.settings,
    });
  }

  function addEmployee() {
    if (!run) return;
    if (run.status === 'final') return;
    const mk = monthKey(run.periodYear, run.periodMonth);

    const employee = makeNewEmployeeRecord({
      id: newId(),
      fullName: 'New employee',
      state: run.settings?.defaultState,
      annualGross: '0',
      fromMonth: mk,
    });

    const item = makeRunItemFromEmployee({ id: newId(), employee });
    setDraftNameById((prev) => ({
      ...prev,
      [item.id]: item.employeeSnapshot.fullName,
    }));
    setDraftAnnualGrossById((prev) => ({
      ...prev,
      [item.id]:
        item.payProfileSnapshot.compensationHistory[0]?.annualGross ?? '',
    }));
    setRun({ ...run, items: [...run.items, item] });
  }

  function commitRunItemName(runItemId: string, fullName: string) {
    if (!run) return;
    setRun({
      ...run,
      items: run.items.map((item) =>
        item.id === runItemId
          ? {
              ...item,
              employeeSnapshot: { ...item.employeeSnapshot, fullName },
            }
          : item,
      ),
    });
  }

  function commitRunItemAnnualGross(runItemId: string, annualGross: string) {
    if (!run) return;
    const mk = monthKey(run.periodYear, run.periodMonth);
    setRun({
      ...run,
      items: run.items.map((item) => {
        if (item.id !== runItemId) return item;
        const nextHistory = [...item.payProfileSnapshot.compensationHistory];
        if (nextHistory.length === 0) {
          nextHistory.push({ fromMonth: mk, annualGross });
        } else {
          nextHistory[0] = { ...nextHistory[0], annualGross };
        }
        return {
          ...item,
          payProfileSnapshot: {
            ...item.payProfileSnapshot,
            compensationHistory: nextHistory,
          },
        };
      }),
    });
  }

  async function finalizeRun() {
    if (!run) return;
    const next: PayrollRun = { ...run, status: 'final', finalizedAt: nowIso() };
    const saved = await saveRun(next);
    lastSavedSig.current = runSignature(saved);
    setRun(saved);
    setError(null);
    await refreshRunsList();
  }

  async function finalizeLocal() {
    setFinalizeOpen(false);
    await finalizeRun();
  }

  async function finalizeAndSignup() {
    setFinalizeOpen(false);
    await finalizeRun();
    if (!run) return;
    await navigate({
      to: '/signup',
      search: {
        intent: 'sync-final-run',
        runId: run.id,
        returnTo: '/',
      },
    });
  }

  async function duplicateRunToEdit() {
    if (!run) return;
    const next: PayrollRun = {
      ...run,
      id: newId(),
      status: 'draft',
      finalizedAt: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      computed: undefined,
    };
    const saved = await saveRun(next);
    lastSavedSig.current = runSignature(saved);
    setActiveRunId(saved.id);
    setRun(saved);
    setError(null);
    await refreshRunsList();
  }

  if (isLoading) return <div className="p-6">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Sheet open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-2xl">
          <SheetHeader>
            <SheetTitle>Finalize this run?</SheetTitle>
            <SheetDescription>
              Final runs are locked. You can still duplicate to edit.
            </SheetDescription>
          </SheetHeader>
          <div className="text-muted-foreground space-y-2 px-4 text-sm">
            <div>Choose where to save:</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>On this device: free, fast, no signup.</li>
              <li>
                To your account: sync across devices and keep history safely.
              </li>
            </ul>
          </div>
          <SheetFooter>
            <Button variant="secondary" onClick={() => void finalizeLocal()}>
              Finalize on this device
            </Button>
            <Button onClick={() => void finalizeAndSignup()}>
              Save &amp; sync (sign up)
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Payroll Tool (Local-first)</div>
        <Button onClick={() => void createRun()}>New run</Button>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        <div className="space-y-2 rounded border p-3">
          <div className="text-sm font-medium">Runs</div>
          <div className="space-y-1">
            {runsIndex.length === 0 && (
              <div className="text-muted-foreground text-sm">No runs yet.</div>
            )}
            {runsIndex.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2"
              >
                <button
                  className={[
                    'flex-1 truncate text-left text-sm',
                    activeRunId === r.id
                      ? 'font-semibold'
                      : 'text-muted-foreground',
                  ].join(' ')}
                  onClick={() => setActiveRunId(r.id)}
                >
                  {r.label} {r.status === 'final' ? '(final)' : ''}
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => void removeRun(r.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded border p-4">
          {!run ? (
            <div className="text-muted-foreground text-sm">
              Create a run to start. Changes auto-save and totals auto-compute.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <label className="text-muted-foreground text-xs">
                    Company
                  </label>
                  <Input
                    value={draftCompanyName}
                    disabled={run.status === 'final'}
                    onChange={(e) => {
                      const v = e.target.value;
                      setError(null);
                      setDraftCompanyName(v);
                      if (isValidNonEmpty(v)) {
                        setRun({ ...run, companyName: v });
                        void updateCompanyName(v);
                      }
                    }}
                    onBlur={() => {
                      if (!isValidNonEmpty(draftCompanyName)) {
                        setDraftCompanyName(run.companyName);
                      }
                    }}
                  />
                </div>
                <div className="text-muted-foreground text-sm">
                  Period: {monthKey(run.periodYear, run.periodMonth)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Employees</div>
                <div className="flex items-center gap-2">
                  {run.status === 'draft' ? (
                    <>
                      <Button variant="secondary" onClick={addEmployee}>
                        Add employee
                      </Button>
                      <Button onClick={() => setFinalizeOpen(true)}>
                        Finalize
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => void duplicateRunToEdit()}>
                      Duplicate to edit
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-2">Name</th>
                      <th className="w-[180px] py-2 pr-2">Annual gross</th>
                      <th className="w-[140px] py-2 pr-2">Monthly gross</th>
                      <th className="w-[140px] py-2 pr-2">PAYE</th>
                      <th className="w-[140px] py-2 pr-2">Net pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.items.map((item) => {
                      const row = computed.value?.items.find(
                        (c) => c.runItemId === item.id,
                      );
                      return (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 pr-2">
                            <Input
                              value={
                                draftNameById[item.id] ??
                                item.employeeSnapshot.fullName
                              }
                              disabled={run.status === 'final'}
                              onChange={(e) => {
                                const v = e.target.value;
                                setError(null);
                                setDraftNameById((prev) => ({
                                  ...prev,
                                  [item.id]: v,
                                }));
                                if (isValidNonEmpty(v)) {
                                  commitRunItemName(item.id, v);
                                }
                              }}
                              onBlur={() => {
                                const v = draftNameById[item.id] ?? '';
                                if (!isValidNonEmpty(v)) {
                                  setDraftNameById((prev) => ({
                                    ...prev,
                                    [item.id]: item.employeeSnapshot.fullName,
                                  }));
                                }
                              }}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              value={
                                draftAnnualGrossById[item.id] ??
                                item.payProfileSnapshot.compensationHistory[0]
                                  ?.annualGross ??
                                ''
                              }
                              disabled={run.status === 'final'}
                              onChange={(e) => {
                                const v = e.target.value;
                                setError(null);
                                setDraftAnnualGrossById((prev) => ({
                                  ...prev,
                                  [item.id]: v,
                                }));
                                if (isValidMoneyFinal(v)) {
                                  commitRunItemAnnualGross(item.id, v);
                                }
                              }}
                              onBlur={() => {
                                const v = draftAnnualGrossById[item.id] ?? '';
                                if (!isValidMoneyFinal(v)) {
                                  setDraftAnnualGrossById((prev) => ({
                                    ...prev,
                                    [item.id]:
                                      item.payProfileSnapshot
                                        .compensationHistory[0]?.annualGross ??
                                      '',
                                  }));
                                }
                              }}
                            />
                          </td>
                          <td className="py-2 pr-2 tabular-nums">
                            {row?.gross ?? '—'}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">
                            {row?.paye ?? '—'}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">
                            {row?.netPay ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded border p-3">
                  <div className="text-muted-foreground text-xs">Employees</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {computed.value?.totals.employeeCount ?? 0}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground text-xs">
                    Gross total
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {computed.value?.totals.grossTotal ?? '0.00'}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground text-xs">
                    PAYE total
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {computed.value?.totals.payeTotal ?? '0.00'}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground text-xs">Net total</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {computed.value?.totals.netTotal ?? '0.00'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
