import { create } from 'zustand';

interface User {
  firstName: string;
  lastName: string;
  initials: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  login: (user?: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  login: (user = { firstName: 'Abdulhakeem', lastName: 'O', initials: 'AO' }) => set({ isAuthenticated: true, user }),
  logout: () => set({ isAuthenticated: false, user: null }),
}));

interface BankState {
  activeBankIndex: number;
  setActiveBankIndex: (index: number) => void;
}

export const useBankStore = create<BankState>((set) => ({
  activeBankIndex: 0,
  setActiveBankIndex: (index: number) => set({ activeBankIndex: index }),
}));
