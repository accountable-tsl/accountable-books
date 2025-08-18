import { useForm } from 'react-hook-form';
import { useCallback, useEffect, useState } from 'react';
import { TransactionData, TransactionFormData, FormError } from '../types';
import { VALIDATION, ERROR_MESSAGES, FORM_CONFIG } from '../constants';

interface UseTransactionFormProps {
  transaction: TransactionData;
  onSubmit: (data: TransactionFormData) => Promise<void>;
  onCancel: () => void;
}

export function useTransactionForm({ transaction, onSubmit, onCancel }: UseTransactionFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty },
    reset,
    watch,
    setValue,
  } = useForm<TransactionFormData>({
    defaultValues: {
      fsDate: transaction.fsDate.toISOString().split('T')[0], // Convert Date to YYYY-MM-DD
      payee: transaction.payee || '',
      project: transaction.project || '',
      description: transaction.description,
      account: transaction.account || '',
    },
    mode: 'onChange', // Validate on change for better UX
  });

  // Custom validation rules
  const validationRules = {
    fsDate: {
      required: ERROR_MESSAGES.FS_DATE_REQUIRED,
    },
    description: {
      required: ERROR_MESSAGES.DESCRIPTION_REQUIRED,
      maxLength: {
        value: VALIDATION.DESCRIPTION_MAX_LENGTH,
        message: ERROR_MESSAGES.DESCRIPTION_TOO_LONG,
      },
      minLength: {
        value: VALIDATION.DESCRIPTION_MIN_LENGTH,
        message: ERROR_MESSAGES.REQUIRED_FIELD,
      },
    },
    payee: {
      maxLength: {
        value: VALIDATION.PAYEE_MAX_LENGTH,
        message: ERROR_MESSAGES.PAYEE_TOO_LONG,
      },
    },
    project: {
      maxLength: {
        value: VALIDATION.PROJECT_MAX_LENGTH,
        message: ERROR_MESSAGES.PROJECT_TOO_LONG,
      },
    },
    account: {
      required: ERROR_MESSAGES.ACCOUNT_REQUIRED,
      maxLength: {
        value: VALIDATION.ACCOUNT_MAX_LENGTH,
        message: ERROR_MESSAGES.ACCOUNT_TOO_LONG,
      },
    },
  };

  // Handle form submission with retry logic
  const handleFormSubmit = useCallback(
    async (data: TransactionFormData) => {
      setIsSubmitting(true);
      setError(null);

      try {
        await onSubmit(data);
        setIsSubmitting(false);
        setRetryCount(0);
        return true;
      } catch (err) {
        setIsSubmitting(false);
        const errorMessage = err instanceof Error ? err.message : ERROR_MESSAGES.SAVE_ERROR;
        setError(errorMessage);

        // Retry logic for network errors
        if (retryCount < FORM_CONFIG.MAX_RETRIES && errorMessage.includes('Network')) {
          setRetryCount((prev) => prev + 1);
          setTimeout(() => {
            handleFormSubmit(data);
          }, 1000 * retryCount); // Exponential backoff
        }
        return false;
      }
    },
    [onSubmit, retryCount],
  );

  // Handle form cancellation
  const handleCancel = useCallback(() => {
    if (isDirty) {
      // Could show confirmation dialog here
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?',
      );
      if (!confirmed) return;
    }
    reset();
    setError(null);
    setRetryCount(0);
    onCancel();
  }, [isDirty, reset, onCancel]);

  // Reset form when transaction changes
  useEffect(() => {
    reset({
      fsDate: transaction.fsDate.toISOString().split('T')[0],
      payee: transaction.payee || '',
      project: transaction.project || '',
      description: transaction.description,
      account: transaction.account || '',
    });
    setError(null);
    setRetryCount(0);
  }, [transaction, reset]);

  // Auto-save functionality (optional)
  const watchedValues = watch();
  useEffect(() => {
    if (!isDirty || !isValid) return;

    const autoSaveTimer = setTimeout(() => {
      if (isDirty && isValid && !isSubmitting) {
        handleFormSubmit(watchedValues);
      }
    }, FORM_CONFIG.AUTO_SAVE_DELAY);

    return () => clearTimeout(autoSaveTimer);
  }, [watchedValues, isDirty, isValid, isSubmitting, handleFormSubmit]);

  return {
    register,
    handleSubmit: (e: React.FormEvent) => {
      e.preventDefault();
      handleSubmit();
    },
    handleCancel,
    errors,
    isSubmitting,
    error,
    isValid,
    isDirty,
    validationRules,
    retryCount,
    reset,
  };
}
