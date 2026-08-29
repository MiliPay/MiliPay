import { create } from 'zustand';

import { supabase } from '../lib/supabase';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  email: string;
  phone: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  initialize: () => void;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  
  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || '';
        const names = fullName.split(' ');
        
        set({ 
          isAuthenticated: true, 
          user: {
            id: session.user.id,
            firstName: names[0] || 'User',
            lastName: names[1] || '',
            initials: (names[0]?.[0] || 'U') + (names[1]?.[0] || ''),
            email: session.user.email || '',
            phone: session.user.phone || '',
          },
          isLoading: false
        });
      } else {
        set({ isLoading: false, isAuthenticated: false, user: null });
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || '';
        const names = fullName.split(' ');
        
        set({ 
          isAuthenticated: true, 
          user: {
            id: session.user.id,
            firstName: names[0] || 'User',
            lastName: names[1] || '',
            initials: (names[0]?.[0] || 'U') + (names[1]?.[0] || ''),
            email: session.user.email || '',
            phone: session.user.phone || '',
          }
        });
      } else {
        set({ isAuthenticated: false, user: null });
      }
    });
  },

  login: async (phoneInput: string, password: string) => {
    let phone = phoneInput.trim();
    if (phone.startsWith('0') && phone.length === 11) {
      phone = '+234' + phone.slice(1);
    } else if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    const { error } = await supabase.auth.signInWithPassword({
      phone,
      password: password.trim()
    });
    
    if (error) {
      throw new Error(error.message);
    }
  },
  
  logout: async () => {
    await supabase.auth.signOut();
    set({ isAuthenticated: false, user: null });
  },
}));

interface LinkedAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: string; // We'll mock a real balance since we don't have a real banking API to check balance yet
}

interface BankState {
  linkedAccounts: LinkedAccount[];
  activeBankIndex: number;
  isLoading: boolean;
  error: string | null;
  fetchAccounts: (userId: string) => Promise<void>;
  setActiveBankIndex: (index: number) => void;
  linkMonoAccount: (monoCode: string) => Promise<void>;
}

export const useBankStore = create<BankState>((set, get) => ({
  linkedAccounts: [],
  activeBankIndex: 0,
  isLoading: false,
  error: null,
  
  fetchAccounts: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('linked_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      const accounts = (data || []).map((acc: any) => ({
        id: acc.id,
        bankName: acc.bank_name,
        accountName: acc.account_name,
        accountNumber: acc.account_number,
        // Since we removed mocks, but we don't have a real banking API to pull real-time balances, 
        // we'll assign a static default balance for the UI requirement, or randomly generate it based on ID.
        // But to be fully "no mock", we should ideally get it from the bank. 
        // For now, we will just set a placeholder or derive from ID. Let's use ₦0.00 to be safe from fake data.
        balance: '₦0.00' 
      }));
      
      set({ linkedAccounts: accounts, isLoading: false });
    } catch (err: any) {
      console.error("Error fetching bank accounts:", err);
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveBankIndex: (index: number) => set({ activeBankIndex: index }),

  linkMonoAccount: async (monoCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('link-mono-account', {
        body: { monoCode },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error || "Unknown Edge Function Error");
      }

      const newAccount = {
        id: data.account.id,
        bankName: data.account.bank_name,
        accountName: data.account.account_name,
        accountNumber: data.account.account_number,
        balance: '₦0.00' // Mocked balance for UI until we fetch live balances
      };
      
      set(state => ({
        linkedAccounts: [...state.linkedAccounts, newAccount],
        isLoading: false
      }));
    } catch (err: any) {
      console.error("Error linking mono account:", err);
      set({ error: err.message, isLoading: false });
      throw err;
    }
  }
}));
