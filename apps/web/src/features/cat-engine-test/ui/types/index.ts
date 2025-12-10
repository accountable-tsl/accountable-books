import type { GroupedTransaction } from '@modules/accounting/categorization';

/**
 * Legacy transaction data type for backward compatibility
 * Will be replaced with GroupedTransaction in future updates
 */
export interface TransactionData {
  id: string;
  amount: number;
  description: string;
  payee?: string;
  project?: string;
  bankLogo?: string;
  bankName?: string;
  account?: string;
  confidence?: number;
  explanation?: string;
  date: Date;
  fsDate: Date;
  currency?: string;
}

export interface CatEngineTxnViewProps {
  transactionGroup?: GroupedTransaction | null;
  accordionItemId?: string;
  className?: string;
  onEdit?: () => void;
  onAccept?: () => void;
  onMarkReviewed?: () => void;
  isEditable?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

// Form-related types for future implementation
export interface TransactionFormData {
  fsDate: string; // HTML date input returns string
  payee: string;
  project: string;
  description: string;
  account: string;
}

export interface TransactionFormProps {
  transaction: TransactionData;
  onSubmit: (data: TransactionFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export interface CatEngineFormProps {
  transaction: TransactionData;
  onSubmit: (data: TransactionFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

// Error types
export interface FormError {
  field: string;
  message: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
}
