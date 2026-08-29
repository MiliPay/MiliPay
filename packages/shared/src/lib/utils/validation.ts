export function isValidNigerianPhone(value: string): boolean {
  return /^(\+234|0)[789][01]\d{8}$/.test(value.trim());
}

export function isValidNin(value: string): boolean {
  return /^\d{11}$/.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  if (!value) return true; // email is optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isNotBlank(value: string): boolean {
  return value.trim().length > 0;
}

export interface FieldError {
  field: string;
  message: string;
}

export function validateCustomerDraft(draft: {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  nin: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  palmVeinTemplate: string;
}): FieldError[] {
  const errors: FieldError[] = [];

  if (!isNotBlank(draft.fullName)) {
    errors.push({ field: "fullName", message: "Enter the customer's full name." });
  }
  if (!isNotBlank(draft.dateOfBirth)) {
    errors.push({ field: "dateOfBirth", message: "Enter a date of birth." });
  }
  if (!isNotBlank(draft.gender)) {
    errors.push({ field: "gender", message: "Select a gender." });
  }
  if (!isValidNin(draft.nin)) {
    errors.push({ field: "nin", message: "NIN must be exactly 11 digits." });
  }
  if (!isValidNigerianPhone(draft.phone)) {
    errors.push({ field: "phone", message: "Enter a valid Nigerian phone number." });
  }
  if (!isValidEmail(draft.email)) {
    errors.push({ field: "email", message: "Enter a valid email address." });
  }
  if (!isNotBlank(draft.address)) {
    errors.push({ field: "address", message: "Enter a residential address." });
  }
  if (!isNotBlank(draft.state)) {
    errors.push({ field: "state", message: "Select a state." });
  }
  if (!isNotBlank(draft.palmVeinTemplate)) {
    errors.push({ field: "palmVein", message: "A Palm Vein scan is required." });
  }

  return errors;
}