import { Transaction } from '@/types';

export async function fetchRecentTransactions(): Promise<Transaction[]> {
  return [
    { id: '1', user: 'Alex Chen', amount: 20, status: 'Success', time: '10:03 AM' }
  ];
}