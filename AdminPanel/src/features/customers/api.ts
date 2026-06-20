import { CustomerDraft } from '@/types';

export async function registerCustomer(draft: CustomerDraft): Promise<void> {
  console.log('Registering', draft);
}