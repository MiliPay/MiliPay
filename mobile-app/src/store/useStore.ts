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

/**
 * What the customer still has to do before they can use the app.
 *
 * Authoritative on the server (public.customers), not in user_metadata, which
 * the customer can write themselves.
 */
export interface OnboardingState {
  found: boolean;
  mustChangePassword: boolean;
  hasPin: boolean;
  biometricEnrolled: boolean;
  onboardingComplete: boolean;
  kycTier: number;
  pinThreshold: number;
  singleLimit: number | null;
  dailyLimit: number | null;
  status: string;
}

export interface TransactionLimits {
  singleLimit: number;
  dailyLimit: number;
  maxSingle: number;
  maxDaily: number;
  pinThreshold: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  onboarding: OnboardingState | null;
  initialize: () => void;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePinThreshold: (threshold: number) => Promise<boolean>;
  setPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  hasPin: () => Promise<boolean>;
  refreshOnboarding: () => Promise<OnboardingState | null>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  verifyPin: (pin: string) => Promise<{ valid: boolean; error?: string; attemptsRemaining?: number }>;
  setBiometricEnrolled: (enrolled: boolean) => Promise<void>;
  completeOnboarding: () => Promise<boolean>;
  setTransactionLimits: (
    single: number | null,
    daily: number | null
  ) => Promise<{ success: boolean; error?: string; limits?: TransactionLimits }>;
}

/**
 * Columns a customer session may read. `select('*')` no longer works: the raw
 * NIN/BVN, the biometric templates and the PIN hash are withheld at the column
 * level by migration 20260921000000.
 */
const CUSTOMER_COLUMNS =
  'id, first_name, last_name, phone, email, address, state, nin_last_4, ' +
  'kyc_tier, pin_threshold, single_limit, daily_limit, status, ' +
  'must_change_password, biometric_enrolled_at, onboarding_completed_at';

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  onboarding: null,
  
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
            .select(CUSTOMER_COLUMNS)
            .eq('auth_user_id', session.user.id)
            .maybeSingle();
          customerData = data;
        } catch (err) {
          console.warn('Could not fetch customer details:', err);
        }

        // Resolved before the navigator renders, so the first frame after a
        // restored session already knows whether onboarding is outstanding.
        await get().refreshOnboarding();
        
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
            .select(CUSTOMER_COLUMNS)
            .eq('auth_user_id', session.user.id)
            .maybeSingle();
          customerData = data;
        } catch (err) {
          console.warn('Could not fetch customer details in auth change:', err);
        }

        await get().refreshOnboarding();
        
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
    set({ isAuthenticated: false, user: null, onboarding: null });
  },

  refreshOnboarding: async () => {
    try {
      const { data, error } = await supabase.rpc('get_onboarding_state');
      if (error) {
        console.warn('Could not load onboarding state:', error.message);
        return null;
      }

      const state: OnboardingState = {
        found: Boolean(data?.found),
        mustChangePassword: Boolean(data?.mustChangePassword),
        hasPin: Boolean(data?.hasPin),
        biometricEnrolled: Boolean(data?.biometricEnrolled),
        onboardingComplete: Boolean(data?.onboardingComplete),
        kycTier: Number(data?.kycTier) || 2,
        pinThreshold: Number(data?.pinThreshold) || 10000,
        singleLimit: data?.singleLimit === null || data?.singleLimit === undefined
          ? null
          : Number(data.singleLimit),
        dailyLimit: data?.dailyLimit === null || data?.dailyLimit === undefined
          ? null
          : Number(data.dailyLimit),
        status: data?.status || 'active',
      };

      set({ onboarding: state });
      return state;
    } catch (err) {
      console.warn('Onboarding state error:', err);
      return null;
    }
  },

  /**
   * Change the password, then clear the server-side flag.
   *
   * The flag is only cleared once Supabase has accepted the new password, so a
   * failed change leaves the customer on the change-password screen.
   */
  changePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, error: error.message };
    }

    const { error: rpcError } = await supabase.rpc('mark_password_changed');
    if (rpcError) {
      // The password did change; only the flag write failed. Say so rather than
      // implying the new password did not take.
      console.warn('Password changed but flag not cleared:', rpcError.message);
    }

    await get().refreshOnboarding();
    return { success: true };
  },

  verifyPin: async (pin: string) => {
    const { data, error } = await supabase.rpc('verify_own_pin', { p_pin: pin });
    if (error) {
      return { valid: false, error: error.message };
    }
    if (data?.valid) {
      return { valid: true };
    }

    const code = data?.code ?? 'PIN_INCORRECT';
    const message =
      code === 'PIN_LOCKED'
        ? 'Too many incorrect attempts. Your PIN is locked for 15 minutes.'
        : code === 'PIN_NOT_SET'
        ? 'No PIN is set on this account.'
        : `Incorrect PIN. ${data?.attemptsRemaining ?? 0} attempt(s) remaining.`;

    return { valid: false, error: message, attemptsRemaining: data?.attemptsRemaining };
  },

  setBiometricEnrolled: async (enrolled: boolean) => {
    const { error } = await supabase.rpc('set_biometric_enrolled', { p_enrolled: enrolled });
    if (error) {
      console.warn('Could not record biometric enrolment:', error.message);
      return;
    }
    await get().refreshOnboarding();
  },

  completeOnboarding: async () => {
    const { data, error } = await supabase.rpc('complete_onboarding');
    if (error || !data?.success) {
      console.warn('Could not complete onboarding:', error?.message ?? data?.error);
      return false;
    }
    await get().refreshOnboarding();
    return true;
  },

  setTransactionLimits: async (single: number | null, daily: number | null) => {
    const { data, error } = await supabase.rpc('set_transaction_limits', {
      p_single: single,
      p_daily: daily,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const limits: TransactionLimits = {
      singleLimit: Number(data?.singleLimit),
      dailyLimit: Number(data?.dailyLimit),
      maxSingle: Number(data?.maxSingle),
      maxDaily: Number(data?.maxDaily),
      pinThreshold: Number(data?.pinThreshold),
    };

    set((state) => ({
      user: state.user ? { ...state.user, pinThreshold: limits.pinThreshold } : null,
    }));
    await get().refreshOnboarding();

    return { success: true, limits };
  },

  updatePinThreshold: async (newThreshold: number) => {
    const currentUser = get().user;
    if (!currentUser) return false;
    try {
      // Single authoritative write path. Writing the tables directly only ever
      // half-applied: RLS blocks a customer login from updating public.customers,
      // which is the row the payment functions read first.
      const { data, error } = await supabase.rpc('set_pin_threshold', {
        p_threshold: newThreshold,
      });

      if (error) {
        console.error('Error updating pin threshold:', error.message);
        return false;
      }

      const applied = Number(data?.pinThreshold ?? newThreshold);
      set(state => ({
        user: state.user ? { ...state.user, pinThreshold: applied } : null
      }));
      return true;
    } catch (err) {
      console.error("Error updating pin threshold in store:", err);
      return false;
    }
  },

  setPin: async (pin: string) => {
    const { error } = await supabase.rpc('set_customer_pin', { p_pin: pin });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  },

  hasPin: async () => {
    const { data, error } = await supabase.rpc('customer_has_pin');
    if (error) {
      console.warn('Could not check PIN status:', error.message);
      return false;
    }
    return Boolean(data);
  },
}));

const formatNaira = (amount: number): string =>
  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface LinkedAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: string; // Formatted for display (e.g. ₦100,000.00)
  balanceNgn: number; // Naira, numeric(12,2) — matches the column exactly. Never kobo.
}

interface BankState {
  linkedAccounts: LinkedAccount[];
  activeBankIndex: number;
  isLoading: boolean;
  error: string | null;
  fetchAccounts: (userId: string) => Promise<void>;
  setActiveBankIndex: (index: number) => void;
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
        // Display only, and possibly stale — see balance_as_of. Nothing spends
        // from this; a purchase debits the bank through Mono.
        const naira = Number(acc.cached_balance) || 0;
        return {
          id: acc.id,
          bankName: acc.bank_name,
          accountName: acc.account_name,
          accountNumber: acc.account_number,
          balanceNgn: naira,
          balance: formatNaira(naira),
        };
      });

      set({ linkedAccounts: accounts, isLoading: false });
    } catch (err: any) {
      console.error("Error fetching bank accounts:", err);
      set({ error: err.message, isLoading: false });
    }
  },

  setActiveBankIndex: (index: number) => set({ activeBankIndex: index }),


  unlinkAccount: async (id: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('unlink_bank_account', {
        target_account_id: id
      });

      if (rpcError || (data && !data.success)) {
        // There used to be a direct table UPDATE here as a fallback. It only
        // worked because 'authenticated' held an UPDATE grant on
        // linked_accounts with no WITH CHECK — the same grant that let anyone
        // set their own balance to whatever they liked. The grant is gone, so
        // unlink_bank_account is the only path, and a failure is surfaced
        // rather than worked around.
        console.error("Failed to unlink account:", rpcError?.message ?? data?.error);
        throw new Error("Could not unlink this account. Please try again.");
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

      // balance arrives already normalised to Naira by the Edge Function.
      const naira = Number(data.account.balance) || 0;
      const newAccount: LinkedAccount = {
        id: data.account.id,
        bankName: data.account.bank_name,
        accountName: data.account.account_name,
        accountNumber: data.account.account_number,
        balanceNgn: naira,
        balance: formatNaira(naira),
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


interface TransactionState {
  transactions: AppTransaction[];
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (userId: string, customerId?: string) => Promise<void>;
  /**
   * Live history and live balance.
   *
   * A purchase settles asynchronously now — the bank confirms by webhook and
   * the airtime follows — so a transaction genuinely changes state while the
   * customer is looking at the list. Without this they see "Confirming with
   * your bank" until they pull to refresh, which reads as a stuck payment.
   *
   * Returns an unsubscribe. Call it on sign-out or the channel outlives the
   * session.
   */
  subscribeToLive: (userId: string) => () => void;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
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

  subscribeToLive: (userId: string) => {
    const channel = supabase
      .channel(`live_activity_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;

          const mapped: AppTransaction = {
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
          };

          set((state) => {
            const index = state.transactions.findIndex((t) => t.id === mapped.id);
            if (index === -1) {
              return { transactions: [mapped, ...state.transactions] };
            }
            // Replace in place. A status change must not reorder the list
            // under the customer's thumb while they are reading it.
            const next = [...state.transactions];
            next[index] = { ...next[index], ...mapped };
            return { transactions: next };
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'linked_accounts',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // The cached balance moved. Re-read through the store's own mapper
          // rather than patching a number in place, so there is one code path
          // that decides what a balance looks like.
          void useBankStore.getState().fetchAccounts(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));

