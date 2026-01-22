import type { EmployeeRecord, PayrollRunItem } from '@/payroll/domain';
import { generateId } from '@/payroll/utils';
import {
  loadEmployeeDirectory,
  saveEmployeeDirectory,
} from '@/payroll/storage';

// Build a directory-friendly EmployeeRecord from a run item snapshot.
export function buildEmployeeRecordFromRunItem(
  runItem: PayrollRunItem,
  employeeId: string,
): EmployeeRecord {
  return {
    identity: {
      id: employeeId,
      fullName: runItem.employeeSnapshot.fullName,
      employeeId: runItem.employeeSnapshot.employeeId,
      role: runItem.employeeSnapshot.role,
      department: runItem.employeeSnapshot.department,
      email: runItem.employeeSnapshot.email,
      phoneNumber: runItem.employeeSnapshot.phoneNumber,
      joinDate: runItem.employeeSnapshot.joinDate,
      exitDate: runItem.employeeSnapshot.exitDate,
      bankName: runItem.employeeSnapshot.bankName,
      bankAccountNumber: runItem.employeeSnapshot.bankAccountNumber,
      bankAccountName: runItem.employeeSnapshot.bankAccountName,
      taxId: runItem.employeeSnapshot.taxId,
      pfa: runItem.employeeSnapshot.pfa,
      rsaPin: runItem.employeeSnapshot.rsaPin,
    },
    payProfile: runItem.payProfileSnapshot,
  };
}

// Create or update the employee directory entry from a run item snapshot.
export async function upsertEmployeeRecordFromRunItem(
  runItem: PayrollRunItem,
  options?: { allowCreateRef?: boolean },
): Promise<{ employeeId?: string }> {
  const employeeId =
    runItem.employeeRefId ?? (options?.allowCreateRef ? generateId() : undefined);

  if (!employeeId) {
    return { employeeId: undefined };
  }

  const directory = await loadEmployeeDirectory();
  const updatedEmployeeRecord = buildEmployeeRecordFromRunItem(
    runItem,
    employeeId,
  );
  const updatedDirectory = {
    employeesById: {
      ...(directory?.employeesById ?? {}),
      [employeeId]: updatedEmployeeRecord,
    },
    createdAt: directory?.createdAt,
  };

  await saveEmployeeDirectory(updatedDirectory);

  return { employeeId };
}

// Remove an employee record from the directory.
export async function deleteEmployeeRecord(
  employeeRefId: string,
): Promise<boolean> {
  const directory = await loadEmployeeDirectory();
  if (!directory?.employeesById[employeeRefId]) {
    return false;
  }

  const { [employeeRefId]: _, ...rest } = directory.employeesById;
  await saveEmployeeDirectory({
    employeesById: rest,
    createdAt: directory.createdAt,
  });

  return true;
}
