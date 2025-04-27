import { MultiSelectOption, MultiSelectOptionGroup } from "@/types/types";

export function groupOptionsBy<T extends Record<string, any>>(
  data: T[],
  groupByKey: keyof T,
  sortGroups: boolean = false,
  othersLabel: string = "Others"
): MultiSelectOptionGroup[] {
  const groupMap: Record<string, MultiSelectOption[]> = {};

  for (const item of data) {
    const group = item[groupByKey]?.trim?.() || "Others";

    if (!groupMap[group]) {
      groupMap[group] = [];
    }

    groupMap[group].push({
      label: item.accountName,
      value: item.id,
      disabled: item.disabled,
    });
  }

  let entries = Object.entries(groupMap);

  if (sortGroups) {
    entries = entries.sort(([a], [b]) => a.localeCompare(b));
  }

  const othersEntry = entries.find(([label]) => label === othersLabel);
  entries = entries.filter(([label]) => label !== othersLabel);

  if (othersEntry) {
    entries.push(othersEntry);
  }
  return entries.map(([label, options]) => ({ label, options }));
}
