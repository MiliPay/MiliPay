import { CustomerDraft } from '@/types';

export interface FieldError {
  field: string;
  message: string;
}

export function validateCustomerDraft(draft: CustomerDraft): FieldError[] {
  const errors: FieldError[] = [];
  if (!draft.fullName) errors.push({ field: 'fullName', message: 'Required' });
  return errors;
}