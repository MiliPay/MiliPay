import { create } from 'zustand';

import { supabase } from '../lib/supabase';

interface User {
  id: string;
  customerId?: string;
  firstName: string;
  lastName: string;
  initials: string;
  email: string;
  phone: string;
  address?: string;
  nin?: string;
  kycTier?: number;
  pinThreshold?: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  initialize: () => void;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePinThreshold: (threshold: number) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  
  initialize: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('Session retrieval error in mobile app:', error);
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || '';
        const names = fullName.split(' ');
        
        let customerData: any = null;
        try {
          const { data } = await supabase
            .from('customers')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();
          customerData = data;
        } catch (err) {
          console.warn('Could not fetch customer details:', err);
        }
        
        set({ 
          isAuthenticated: true, 
          user: {
            id: session.user.id,
            customerId: customerData?.id,
            firstName: names[0] || 'User',
            lastName: names[1] || '',
            initials: (names[0]?.[0] || 'U') + (names[1]?.[0] || ''),
            email: session.user.email || '',
            phone: session.user.phone || '',
            nin: customerData?.nin_last_4 || undefined,
            address: customerData?.address || customerData?.state || undefined,
            kycTier: customerData?.kyc_tier || 2,
            pinThreshold: Number(customerData?.pin_threshold) || 10000,
          },
          isLoading: false
        });
      } else {
        set({ isLoading: false, isAuthenticated: false, user: null });
      }
    } catch (err) {
      console.warn('Auth initialization error:', err);
      set({ isLoading: false, isAuthenticated: false, user: null });
    }

    // Listen for future auth state changes (sign in, sign out, token refresh)
    supabase.auth.onAuthStateChange(async (event, session) => {
      // Ignore INITIAL_SESSION to prevent race condition with getSession()
      if (event === 'INITIAL_SESSION') return;

      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const fullName = meta.full_name || '';
        const names = fullName.split(' ');
        
        let customerData: any = null;
        try {
          const { data } = await supabase
            .from('customers')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();
          customerData = data;
        } catch (err) {
          console.warn('Could not fetch customer details in auth change:', err);
        }
        
        set({ 
          isAuthenticated: true, 
          user: {
            id: session.user.id,
            customerId: customerData?.id,
            firstName: names[0] || 'User',
            lastName: names[1] || '',
            initials: (names[0]?.[0] || 'U') + (names[1]?.[0] || ''),
            email: session.user.email || '',
            phone: session.user.phone || '',
            nin: customerData?.nin_last_4 || undefined,
            address: customerData?.address || customerData?.state || undefined,
            kycTier: customerData?.kyc_tier || 2,
            pinThreshold: Number(customerData?.pin_threshold) || 10000,
          },
          isLoading: false
        });
      } else {
        set({ isAuthenticated: false, user: null, isLoading: false });
      }
    });
  },

  login: async (identifierInput: string, password: string) => {
    const identifier = identifierInput.trim();
    const cleanPassword = password.trim();

    if (identifier.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({
        email: identifier.toLowerCase(),
        password: cleanPassword,
      });
      if (error) {
        throw new Error(error.message);
      }
      return;
    }

    let phone = identifier;
    if (phone.startsWith('0') && phone.length === 11) {
      phone = '+234' + phone.slice(1);
    } else if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    const { error } = await supabase.auth.signInWithPassword({
      phone,
      password: cleanPassword,
    });
    
    if (error) {
      throw new Error(error.message);
    }
  },
  
  logout: async () => {
    await supabase.auth.signOut();
    set({ isAuthenticated: false, user: null });
  },

  updatePinThreshold: async (newThreshold: number) => {
    const currentUser = get().user;
    if (!currentUser) return false;
    try {
      if (currentUser.customerId) {
        await supabase
          .from('customers')
          .update({ pin_threshold: newThreshold })
          .eq('id', currentUser.customerId);
      }
      await supabase
        .from('users')
        .update({ pin_threshold: newThreshold })
        .eq('id', currentUser.id);

      set(state => ({
        user: state.user ? { ...state.user, pinThreshold: newThreshold } : null
      }));
      return true;
    } catch (err) {
      console.error("Error updating pin threshold in store:", err);
      return false;
    }
  },
}));

export interface LinkedAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: string; // Formatted currency string (e.g. ₦100,000.00)
  rawBalance?: number; // Balance in kobo (e.g. 10000000)
}

interface BankState {
  linkedAccounts: LinkedAccount[];
  activeBankIndex: number;
  isLoading: boolean;
  error: string | null;
  fetchAccounts: (userId: string) => Promise<void>;
  setActiveBankIndex: (index: number) => void;
  deductBalance: (accountId: string, amountInNaira: number) => Promise<void>;
  linkMonoAccount: (monoCode: string) => Promise<void>;
  unlinkAccount: (id: string) => Promise<void>;
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
      
      const accounts = (data || []).map((acc: any) => {
        const kobo = typeof acc.balance === 'number' ? acc.balance : 10000000;
        const naira = kobo / 100;
        return {
          id: acc.id,
          bankName: acc.bank_name,
          accountName: acc.account_name,
          accountNumber: acc.account_number,
          rawBalance: kobo,
          balance: `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
        };
      });
      
      set({ linkedAccounts: accounts, isLoading: false });
    } catch (err: any) {
      console.error("Error fetching bank accounts:", err);
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveBankIndex: (index: number) => set({ activeBankIndex: index }),

  deductBalance: async (accountId: string, amountInNaira: number) => {
    let newKobo = 0;
    
    // 1. Immediately update Zustand in-memory state for instant UI responsiveness
    set((state) => {
      const updated = state.linkedAccounts.map((acc) => {
        if (acc.id === accountId) {
          const currentKobo = typeof acc.rawBalance === 'number'
            ? acc.rawBalance
            : Math.round((parseFloat(acc.balance.replace(/[^0-9.]/g, '')) || 100000) * 100);

          const deductionKobo = Math.round(amountInNaira * 100);
          newKobo = Math.max(0, currentKobo - deductionKobo);
          const newNaira = newKobo / 100;

          return {
            ...acc,
            rawBalance: newKobo,
            balance: `₦${newNaira.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
          };
        }
        return acc;
      });
      return { linkedAccounts: updated };
    });

    // 2. Persist deduction to Supabase linked_accounts table
    try {
      const { error } = await supabase
        .from('linked_accounts')
        .update({ balance: newKobo })
        .eq('id', accountId);

      if (error) {
        console.error('Error updating bank balance in Supabase:', error);
      }
    } catch (err) {
      console.error('Error in deductBalance:', err);
    }
  },

  unlinkAccount: async (id: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('unlink_bank_account', {
        target_account_id: id
      });

      if (rpcError || (data && !data.success)) {
        const { error: dbError } = await supabase
          .from('linked_accounts')
          .update({ is_active: false })
          .eq('id', id);
        if (dbError) {
          console.error("Failed to update is_active in supabase:", dbError);
        }
      }
    } catch (err) {
      console.error("Error unlinking account:", err);
    } finally {
      set(state => ({
        linkedAccounts: state.linkedAccounts.filter(acc => acc.id !== id),
        activeBankIndex: 0
      }));
    }
  },
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
        balance: `₦${((data.account.balance || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
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

export interface SupportMessage {
  id: string;
  ticket_id: string;
  content: string;
  sender_type: 'customer' | 'staff' | 'system';
  created_at: string;
}

export interface SupportConversation {
  id: string;
  ticket_id?: string;
  issue_description: string;
  subject?: string;
  status: 'open' | 'in_progress' | 'resolved';
  urgency: string;
  is_escalated?: boolean;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
}

interface SupportState {
  conversations: SupportConversation[];
  activeTicket: SupportConversation | null;
  activeTicketId: string | null;
  messages: SupportMessage[];
  isLoading: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  subscription: any | null;
  fetchConversations: () => Promise<void>;
  startNewChat: (description?: string) => Promise<string | null>;
  selectChat: (ticketId: string) => Promise<void>;
  leaveChat: () => void;
  sendMessage: (content: string) => Promise<void>;
  unsubscribe: () => void;
}

export const useSupportStore = create<SupportState>((set, get) => ({
  conversations: [],
  activeTicket: null,
  activeTicketId: null,
  messages: [],
  isLoading: false,
  isLoadingMessages: false,
  error: null,
  subscription: null,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        set({ conversations: [], isLoading: false });
        return;
      }

      // Fetch customer record if present
      const { data: customerRecord } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      let query = supabase
        .from('support_tickets')
        .select('*');

      if (customerRecord?.id) {
        query = query.or(`created_by.eq.${user.id},customer_id.eq.${customerRecord.id}`);
      } else {
        query = query.eq('created_by', user.id);
      }

      const { data: tickets, error: ticketError } = await query
        .order('updated_at', { ascending: false });

      if (ticketError) throw ticketError;

      const convList: SupportConversation[] = [];

      for (const t of (tickets || [])) {
        // Fetch the last message preview for this ticket
        const { data: lastMsg } = await supabase
          .from('ticket_messages')
          .select('content, created_at')
          .eq('ticket_id', t.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        convList.push({
          id: t.id,
          ticket_id: t.ticket_id,
          issue_description: t.issue_description,
          subject: t.subject,
          status: t.status,
          urgency: t.urgency,
          is_escalated: t.is_escalated,
          assigned_to: t.assigned_to,
          created_at: t.created_at,
          updated_at: t.updated_at,
          last_message: lastMsg?.content || t.issue_description || 'Chat started',
        });
      }

      set({ conversations: convList, isLoading: false });
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  startNewChat: async (description?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error('Not authenticated');

      // Fetch associated customer record to populate customer_id
      const { data: customerRecord } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const issueText = description?.trim() || 'Need help with my account';

      const { data: newTicket, error: createError } = await supabase
        .from('support_tickets')
        .insert({
          created_by: user.id,
          customer_id: customerRecord?.id || null,
          status: 'open',
          urgency: 'medium',
          issue_description: issueText,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Select this fresh chat
      await get().selectChat(newTicket.id);
      return newTicket.id;
    } catch (err: any) {
      console.error('Error starting new chat:', err);
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  selectChat: async (ticketId: string) => {
    get().unsubscribe();
    set({ activeTicketId: ticketId, isLoadingMessages: true, messages: [], error: null });

    try {
      // Fetch ticket info
      const { data: ticketData } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketData) {
        set({
          activeTicket: {
            id: ticketData.id,
            ticket_id: ticketData.ticket_id,
            issue_description: ticketData.issue_description,
            subject: ticketData.subject,
            status: ticketData.status,
            urgency: ticketData.urgency,
            is_escalated: ticketData.is_escalated,
            assigned_to: ticketData.assigned_to,
            created_at: ticketData.created_at,
            updated_at: ticketData.updated_at,
          }
        });
      }

      // Fetch existing messages
      const { data: msgs, error: msgError } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      set({ messages: msgs || [], isLoadingMessages: false });

      // Subscribe to real-time messages & ticket status updates
      const channel = supabase
        .channel(`support_chat_${ticketId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ticket_messages',
            filter: `ticket_id=eq.${ticketId}`
          },
          (payload) => {
            const newMessage = payload.new as SupportMessage;
            set((state) => {
              if (state.messages.some(m => m.id === newMessage.id)) return state;
              return { messages: [...state.messages, newMessage] };
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'support_tickets',
            filter: `id=eq.${ticketId}`
          },
          (payload) => {
            const updated = payload.new as any;
            set((state) => ({
              activeTicket: state.activeTicket ? {
                ...state.activeTicket,
                status: updated.status,
                ticket_id: updated.ticket_id,
                assigned_to: updated.assigned_to,
                is_escalated: updated.is_escalated,
              } : null
            }));
          }
        )
        .subscribe();

      set({ subscription: channel });
    } catch (err: any) {
      console.error('Error selecting chat:', err);
      set({ error: err.message, isLoadingMessages: false });
    }
  },

  leaveChat: () => {
    get().unsubscribe();
    set({ activeTicketId: null, activeTicket: null, messages: [] });
    get().fetchConversations();
  },

  sendMessage: async (content: string) => {
    const { activeTicketId } = get();
    if (!activeTicketId || !content.trim()) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error('Not authenticated');

      const trimmed = content.trim();

      const { data: newMessage, error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: activeTicketId,
          sender_id: user.id,
          sender_type: 'customer',
          content: trimmed,
        })
        .select()
        .single();

      if (error) throw error;

      // Update ticket updated_at and reopen if it was resolved
      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (get().activeTicket?.status === 'resolved') {
        updatePayload.status = 'in_progress';
      }

      await supabase
        .from('support_tickets')
        .update(updatePayload)
        .eq('id', activeTicketId);

      set((state) => {
        const nextMessages = state.messages.some(m => m.id === newMessage.id)
          ? state.messages
          : [...state.messages, newMessage as SupportMessage];

        return {
          messages: nextMessages,
          activeTicket: state.activeTicket && updatePayload.status
            ? { ...state.activeTicket, status: updatePayload.status }
            : state.activeTicket
        };
      });
    } catch (err: any) {
      console.error('Error sending message:', err);
    }
  },

  unsubscribe: () => {
    const { subscription } = get();
    if (subscription) {
      supabase.removeChannel(subscription);
      set({ subscription: null });
    }
  }
}));

export interface AppTransaction {
  id: string;
  reference: string;
  customer_id?: string | null;
  user_id?: string | null;
  merchant_name: string;
  amount: number; // in Naira (e.g. 1000)
  status: 'success' | 'failed' | 'pending';
  account_used?: string | null;
  created_at: string;
  category?: 'bills' | 'pos' | 'transfer' | 'received';
  type?: 'debit' | 'credit' | string;
  direction?: 'inflow' | 'outflow';
  recipient?: string | null;
  units?: string | null;
  token?: string | null;
}

export interface BillPaymentPayload {
  merchantName: string;
  amount: number;
  accountId?: string | null;
  accountUsed?: string | null;
  category?: 'bills' | 'pos' | 'transfer';
  token?: string | null;
}

interface TransactionState {
  transactions: AppTransaction[];
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (userId: string, customerId?: string) => Promise<void>;
  recordBillPayment: (payload: BillPaymentPayload) => Promise<AppTransaction | null>;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  isLoading: false,
  error: null,

  fetchTransactions: async (userId: string, customerId?: string) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (customerId) {
        query = query.or(`user_id.eq.${userId},customer_id.eq.${customerId}`);
      } else {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({
        transactions: (data || []).map((row: any) => ({
          id: row.id,
          reference: row.reference,
          customer_id: row.customer_id,
          user_id: row.user_id,
          merchant_name: row.merchant_name,
          amount: row.amount,
          status: row.status,
          account_used: row.account_used,
          created_at: row.created_at,
          category: 'bills',
        })),
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  recordBillPayment: async (payload: BillPaymentPayload) => {
    try {
      const user = useAuthStore.getState().user;
      const ref = `MP-BIL-${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      let validAccountUuid: string | null = null;
      if (payload.accountId && UUID_REGEX.test(payload.accountId)) {
        validAccountUuid = payload.accountId;
      } else if (payload.accountUsed && UUID_REGEX.test(payload.accountUsed)) {
        validAccountUuid = payload.accountUsed;
      }

      const validUserId = (user?.id && UUID_REGEX.test(user.id)) ? user.id : null;
      const validCustomerId = (user?.customerId && UUID_REGEX.test(user.customerId)) ? user.customerId : null;

      const insertData = {
        reference: ref,
        customer_id: validCustomerId,
        user_id: validUserId,
        merchant_name: payload.merchantName,
        amount: payload.amount,
        status: 'success',
        account_used: validAccountUuid,
      };

      const { error } = await supabase
        .from('transactions')
        .insert(insertData);

      if (error) {
        console.error('Error inserting transaction into Supabase:', error);
      }

      // Automatically deduct from linked bank account
      if (validAccountUuid) {
        await useBankStore.getState().deductBalance(validAccountUuid, payload.amount);
      }

      const newTx: AppTransaction = {
        id: `tx-${Date.now()}`,
        reference: ref,
        customer_id: validCustomerId,
        user_id: validUserId,
        merchant_name: payload.merchantName,
        amount: payload.amount,
        status: 'success',
        account_used: validAccountUuid || payload.accountUsed || null,
        created_at: new Date().toISOString(),
        category: payload.category || 'bills',
        token: payload.token || null,
      };

      set((state) => ({
        transactions: [newTx, ...state.transactions],
      }));

      return newTx;
    } catch (err: any) {
      console.error('Error recording bill payment:', err);
      return null;
    }
  },
}));

