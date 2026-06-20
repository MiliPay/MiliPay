export interface Transaction {
  id: string;
  amount: number;
  status: 'Success' | 'Failed' | 'Pending';
  time: string;
  user: string;
}

export interface CustomerDraft {
  fullName: string;
  phone: string;
  bvn: string;
  nin: string;
  email: string;
  state: string;
  address: string;
}

export const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  fullName: '', phone: '', bvn: '', nin: '', email: '', state: '', address: ''
};