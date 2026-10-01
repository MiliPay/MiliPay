import { create } from 'zustand';

import { supabase } from '../lib/supabase';
import {
  getBiometricCapability,
  isBiometricUnlockEnabled,
  markFingerprintOffered,
  setBiometricUnlockEnabled,
  wasFingerprintOffered,
} from '../lib/deviceAuth';

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
  /** An agent has captured this customer's palm (customers.has_palm_template). */
  hasPalm?: boolean;
  /** Their NIN has been checked (customers.nin_verified). */
  ninVerified?: boolean;
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
  /**
   * The app opened (or came back after a while) with a saved session and
   * fingerprint unlock on: the Unlock screen shows until the customer proves
   * it is them. Nothing behind it is mounted.
   */
  locked: boolean;
  setLocked: (locked: boolean) => void;
  /**
   * Signed in on this phone without fingerprint unlock set up: offer it once
   * (onboarding step 4's screen) before Home.
   */
  offerFingerprint: boolean;
  /** Before a sign-in: decide whether that offer is due on this install. */
  prepareFingerprintOffer: () => Promise<void>;
  finishFingerprintOffer: () => void;
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
  updateProfile: (
    changes: { firstName?: string; lastName?: string; address?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  /**
   * Record an email/phone change the server has already saved, after every
   * code was verified (contact-change). Never a way to change them.
   */
  applyVerifiedContact: (contact: { email?: string | null; phone?: string | null }) => void;
}

/**
 * Columns a customer session may read. `select('*')` no longer works: the raw
 * NIN/BVN, the biometric templates and the PIN hash are withheld at the column
 * level by migration 20260921000000.
 */
const CUSTOMER_COLUMNS =
  'id, first_name, last_name, phone, email, address, state, nin_last_4, ' +
  'kyc_tier, pin_threshold, single_limit, daily_limit, status, ' +
  'must_change_password, biometric_enrolled_at, onboarding_completed_at, has_palm_template, nin_verified';

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  onboarding: null,
  locked: false,
  offerFingerprint: false,

  setLocked: (locked) => set({ locked }),

  prepareFingerprintOffer: async () => {
    const [enabled, offered, capability] = await Promise.all([
      isBiometricUnlockEnabled(),
      wasFingerprintOffered(),
      getBiometricCapability(),
    ]);
    set({ offerFingerprint: !enabled && !offered && capability.hasHardware && capability.isEnrolled });
  },

  finishFingerprintOffer: () => {
    void markFingerprintOffered();
    set({ offerFingerprint: false });
  },
  
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
        
        // Both are needed before the navigator renders — the profile to draw
        // the screen, the onboarding state to know which screen — but neither
        // depends on the other, so they go together. They used to run one
        // after the other, which meant two full round trips of splash screen
        // on every cold start instead of one.
        const loadCustomer = async () => {
          try {
            const { data } = await supabase
              .from('customers')
              .select(CUSTOMER_COLUMNS)
              .eq('auth_user_id', session.user.id)
              .maybeSingle();
            return data as any;
          } catch (err) {
            console.warn('Could not fetch customer details:', err);
            return null;
          }
        };

        const [customerData, , biometricOn] = await Promise.all([
          loadCustomer(),
          get().refreshOnboarding(),
          isBiometricUnlockEnabled(),
        ]);
        
        set({ 
          isAuthenticated: true, 
          // A returning customer with fingerprint unlock proves it is them
          // before anything else shows (design: Unlock).
          locked: biometricOn,
          user: {
            id: session.user.id,
            customerId: customerData?.id,
            firstName: customerData?.first_name || names[0] || 'User',
            lastName: customerData?.last_name || names[1] || '',
            initials:
              ((customerData?.first_name || names[0])?.[0] || 'U') +
              ((customerData?.last_name || names[1])?.[0] || ''),
            email: customerData?.email || session.user.email || '',
            phone: customerData?.phone || session.user.phone || '',
            nin: customerData?.nin_last_4 || undefined,
            address: customerData?.address || customerData?.state || undefined,
            kycTier: customerData?.kyc_tier || 2,
            pinThreshold: Number(customerData?.pin_threshold) || 10000,
            hasPalm: Boolean(customerData?.has_palm_template),
            ninVerified: Boolean(customerData?.nin_verified),
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
            firstName: customerData?.first_name || names[0] || 'User',
            lastName: customerData?.last_name || names[1] || '',
            initials:
              ((customerData?.first_name || names[0])?.[0] || 'U') +
              ((customerData?.last_name || names[1])?.[0] || ''),
            email: customerData?.email || session.user.email || '',
            phone: customerData?.phone || session.user.phone || '',
            nin: customerData?.nin_last_4 || undefined,
            address: customerData?.address || customerData?.state || undefined,
            kycTier: customerData?.kyc_tier || 2,
            pinThreshold: Number(customerData?.pin_threshold) || 10000,
            hasPalm: Boolean(customerData?.has_palm_template),
            ninVerified: Boolean(customerData?.nin_verified),
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
    set({ locked: false });
  },
  
  logout: async () => {
    await supabase.auth.signOut();
    // Fingerprint unlock belongs to the person who turned it on: the next
    // person to sign in on this phone is asked afresh.
    await Promise.all([setBiometricUnlockEnabled(false), markFingerprintOffered(false)]);
    set({ isAuthenticated: false, user: null, onboarding: null, locked: false, offerFingerprint: false });
    // A shared handset: the next person to sign in must not glimpse the last
    // customer's history or inbox while their own is loading.
    useTransactionStore.setState({ transactions: [] });
    useNotificationStore.setState({ notifications: [] });
  },

  /**
   * Save the parts of a profile a customer may change directly: names and
   * address.
   *
   * The database grants `authenticated` UPDATE on a handful of columns only,
   * so kyc_tier, status and the limits cannot be written from here even by a
   * repacked app. Email and phone are not among what this sends: they change
   * only through a code sent to the new one (the contact-change Edge
   * Function), and a database guard refuses them from here.
   */
  updateProfile: async (changes) => {
    const current = get().user;
    if (!current?.customerId) {
      return { success: false, error: 'Your profile is still loading. Try again in a moment.' };
    }

    const payload: Record<string, string> = {};
    if (changes.firstName !== undefined) payload.first_name = changes.firstName.trim();
    if (changes.lastName !== undefined) payload.last_name = changes.lastName.trim();
    if (changes.address !== undefined) payload.address = changes.address.trim();

    if (Object.keys(payload).length === 0) return { success: true };

    if (payload.first_name !== undefined && payload.first_name.length < 2) {
      return { success: false, error: 'Enter your first name.' };
    }

    // .select() matters: a row policy that does not match is not an error, it
    // is zero rows, and PostgREST reports that as success. Without reading the
    // row back, a save that changed nothing would look like a save.
    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', current.customerId)
      .select('first_name, last_name, email, address')
      .maybeSingle();

    if (error) {
      console.warn('[profile] update failed', error.message);
      return { success: false, error: 'Could not save your changes. Please try again.' };
    }
    if (!data) {
      return { success: false, error: 'Could not save your changes. Please try again.' };
    }

    set({
      user: {
        ...current,
        firstName: data.first_name ?? current.firstName,
        lastName: data.last_name ?? current.lastName,
        initials:
          (data.first_name?.[0] ?? current.firstName?.[0] ?? 'U') +
          (data.last_name?.[0] ?? ''),
        email: data.email ?? current.email,
        address: data.address ?? current.address,
      },
    });

    return { success: true };
  },

  applyVerifiedContact: (contact) => {
    const current = get().user;
    if (!current) return;
    set({
      user: {
        ...current,
        email: contact.email ?? current.email,
        phone: contact.phone ?? current.phone,
      },
    });
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
  /** When the balance was read from the bank. It is a snapshot, not live. */
  balanceAsOf: string | null;
}

interface BankState {
  linkedAccounts: LinkedAccount[];
  activeBankIndex: number;
  isLoading: boolean;
  error: string | null;
  fetchAccounts: (userId: string) => Promise<void>;
  setActiveBankIndex: (index: number) => void;
  linkMonoAccount: (monoCode: string) => Promise<void>;
  /** Refused by the server for the last linked account (LAST_ACCOUNT). */
  unlinkAccount: (id: string) => Promise<{ success: true } | { success: false; error: string; code?: string }>;
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
          balanceAsOf: acc.balance_as_of ?? null,
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
    // unlink_bank_account is the only path. There used to be a direct table
    // UPDATE here as a fallback, which only worked because 'authenticated'
    // held an UPDATE grant on linked_accounts with no WITH CHECK — the same
    // grant that let anyone set their own balance. The grant is gone.
    //
    // The account leaves the list only when the server says it is unlinked.
    // It used to be removed whatever happened, so a refused or failed unlink
    // looked like a successful one until the next refresh brought it back.
    const { data, error } = await supabase.rpc('unlink_bank_account', { target_account_id: id });
    if (error || !data?.success) {
      console.warn('[banks] unlink refused', error?.message ?? data?.error);
      return {
        success: false as const,
        code: data?.code,
        error:
          data?.code === 'LAST_ACCOUNT' && typeof data?.error === 'string'
            ? data.error
            : 'Could not unlink this account. Please try again.',
      };
    }
    set((state) => ({
      linkedAccounts: state.linkedAccounts.filter((acc) => acc.id !== id),
      activeBankIndex: 0,
    }));
    return { success: true as const };
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

      // Re-read the list from the server instead of appending the new account
      // to it. Linking can switch an older link OFF on the server — a re-link
      // of the same bank does — and appending kept that dead account in the
      // list, where it could be chosen and the purchase refused with "That
      // bank account is not linked to your profile".
      const userId = sessionData.session?.user?.id;
      if (userId) {
        await get().fetchAccounts(userId);
      } else {
        set({ isLoading: false });
      }
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
  /** The human reference staff see: "TKT-00012". */
  ticket_id: string | null;
  issue_description: string;
  status: string;
  is_escalated: boolean;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  /** The last thing a person said in it (never a system notice). */
  last_message: string;
}

interface SupportState {
  conversations: SupportConversation[];
  isLoading: boolean;
  error: string | null;
  activeTicketId: string | null;
  activeTicket: SupportConversation | null;
  messages: SupportMessage[];
  isLoadingMessages: boolean;
  /** The agent is typing right now (a live signal from the support portal). */
  agentTyping: boolean;
  fetchConversations: () => Promise<void>;
  /**
   * Open a chat with the customer's first message. The ticket is created
   * only now, as in the design: "Start a new chat" shows an empty chat, and
   * nothing reaches the support queue until the customer has said something.
   */
  startNewChat: (firstMessage: string) => Promise<string | null>;
  selectChat: (ticketId: string) => Promise<void>;
  leaveChat: () => void;
  sendMessage: (content: string) => Promise<boolean>;
  unsubscribe: () => void;
}

const TICKET_COLUMNS = 'id, ticket_id, issue_description, status, is_escalated, assigned_to, created_at, updated_at';

function toConversation(row: any, lastMessage?: string): SupportConversation {
  return {
    id: row.id,
    ticket_id: row.ticket_id ?? null,
    issue_description: row.issue_description ?? '',
    status: row.status,
    is_escalated: Boolean(row.is_escalated),
    assigned_to: row.assigned_to ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message: lastMessage ?? row.issue_description ?? '',
  };
}

// Live channels for the open chat, outside the store's state: they are not
// something a screen draws.
let chatChannel: ReturnType<typeof supabase.channel> | null = null;
let typingChannel: ReturnType<typeof supabase.channel> | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;

/** How long the dots stay after the portal's last typing signal. */
const TYPING_HOLD_MS = 4000;

export const useSupportStore = create<SupportState>((set, get) => ({
  conversations: [],
  isLoading: false,
  error: null,
  activeTicketId: null,
  activeTicket: null,
  messages: [],
  isLoadingMessages: false,
  agentTyping: false,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    // Row security limits both reads to the signed-in customer's own tickets.
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select(TICKET_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[support] could not load chats', error.message);
      set({ error: error.message, isLoading: false });
      return;
    }

    // Each card's preview in one read, not one query per ticket.
    const ids = (tickets ?? []).map((t: any) => t.id);
    const lastSaid: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: msgs } = await supabase
        .from('ticket_messages')
        .select('ticket_id, sender_type, content, created_at')
        .in('ticket_id', ids)
        .neq('sender_type', 'system')
        .order('created_at', { ascending: false })
        .limit(500);
      for (const m of msgs ?? []) {
        if (!lastSaid[m.ticket_id]) lastSaid[m.ticket_id] = m.content;
      }
    }

    set({
      conversations: (tickets ?? []).map((t: any) => toConversation(t, lastSaid[t.id])),
      isLoading: false,
    });
  },

  startNewChat: async (firstMessage) => {
    const text = firstMessage.trim();
    if (!text) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;
    const customerId = useAuthStore.getState().user?.customerId ?? null;

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        created_by: userId,
        customer_id: customerId,
        issue_description: text.slice(0, 500),
        status: 'open',
        urgency: 'medium',
      })
      .select(TICKET_COLUMNS)
      .single();
    if (error || !ticket) {
      console.warn('[support] could not start a chat', error?.message);
      set({ error: error?.message ?? 'Could not start a chat' });
      return null;
    }

    const { error: msgError } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: ticket.id, sender_id: userId, sender_type: 'customer', content: text });
    if (msgError) console.warn('[support] first message not saved', msgError.message);

    await get().selectChat(ticket.id);
    void get().fetchConversations();
    return ticket.id;
  },

  selectChat: async (ticketId) => {
    get().unsubscribe();
    set({ activeTicketId: ticketId, activeTicket: null, messages: [], isLoadingMessages: true, agentTyping: false, error: null });

    const [{ data: ticket }, { data: msgs, error: msgError }] = await Promise.all([
      supabase.from('support_tickets').select(TICKET_COLUMNS).eq('id', ticketId).maybeSingle(),
      supabase
        .from('ticket_messages')
        .select('id, ticket_id, content, sender_type, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
        // A long-running ticket is not a reason to load a thousand bubbles
        // before the first one can be drawn.
        .limit(200),
    ]);
    if (get().activeTicketId !== ticketId) return;
    if (msgError) console.warn('[support] could not load messages', msgError.message);
    set({
      activeTicket: ticket ? toConversation(ticket) : null,
      messages: (msgs ?? []) as SupportMessage[],
      isLoadingMessages: false,
    });

    chatChannel = supabase
      .channel(`support_chat_${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const message = payload.new as SupportMessage;
          set((state) => {
            if (state.messages.some((m) => m.id === message.id)) return state;
            // A reply ends the typing dots at once.
            return { messages: [...state.messages, message], agentTyping: message.sender_type === 'staff' ? false : state.agentTyping };
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
        (payload) => {
          set((state) => ({ activeTicket: state.activeTicket ? toConversation(payload.new, state.activeTicket.last_message) : state.activeTicket }));
        },
      )
      .subscribe();

    // "Agent is typing…" — a broadcast from the support portal, nothing stored.
    typingChannel = supabase
      .channel(`support_typing_${ticketId}`)
      .on('broadcast', { event: 'typing' }, (msg) => {
        if ((msg.payload as { from?: string } | undefined)?.from !== 'staff') return;
        set({ agentTyping: true });
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => set({ agentTyping: false }), TYPING_HOLD_MS);
      })
      .subscribe();
  },

  leaveChat: () => {
    get().unsubscribe();
    set({ activeTicketId: null, activeTicket: null, messages: [], agentTyping: false });
    void get().fetchConversations();
  },

  sendMessage: async (content) => {
    const { activeTicketId } = get();
    const text = content.trim();
    if (!activeTicketId || !text) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    // Only the message: the database moves the ticket up the staff queue, and
    // a customer can no longer edit the ticket itself.
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: activeTicketId, sender_id: userId, sender_type: 'customer', content: text })
      .select('id, ticket_id, content, sender_type, created_at')
      .single();
    if (error || !data) {
      console.warn('[support] message not sent', error?.message);
      return false;
    }
    set((state) =>
      state.messages.some((m) => m.id === data.id) ? state : { messages: [...state.messages, data as SupportMessage] },
    );
    return true;
  },

  unsubscribe: () => {
    if (chatChannel) supabase.removeChannel(chatChannel);
    if (typingChannel) supabase.removeChannel(typingChannel);
    if (typingTimer) clearTimeout(typingTimer);
    chatChannel = null;
    typingChannel = null;
    typingTimer = null;
  },
}));

export interface AppTransaction {
  id: string;
  reference: string;
  customer_id?: string | null;
  user_id?: string | null;
  /** The service label ("MTN Airtime", "IKEDC (prepaid)") or the merchant. */
  merchant_name: string;
  amount: number; // in Naira (e.g. 1000), fee included
  /** The payment rail's state machine; older rows may carry legacy words. */
  status: string;
  account_used?: string | null;
  created_at: string;
  /** airtime | data | power | cable. Null on rows from before the rail. */
  service_type?: string | null;
  provider?: string | null;
  /** Phone, meter or smartcard number. */
  beneficiary?: string | null;
  /** What MiliPay charged on top; null when not recorded (older rows). */
  fee_amount?: number | null;
  token?: string | null;
  units?: string | null;
  /** Set on a palm payment made at a merchant's terminal. */
  merchant_id?: string | null;
  terminal_id?: string | null;
}


interface TransactionState {
  transactions: AppTransaction[];
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (userId: string, customerId?: string) => Promise<void>;
  /**
   * Live history, live balance and the live inbox.
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

/**
 * What the history rows and the detail sheet show. Named columns, not '*':
 * the payment rail's lifecycle timestamps, failure reasons and provider
 * references are for staff, not for drawing a list.
 */
const TRANSACTION_LIST_COLUMNS =
  'id, reference, customer_id, user_id, merchant_name, amount, status, account_used, created_at, ' +
  'service_type, provider, beneficiary, fee_amount, token, units, merchant_id, terminal_id';

/**
 * Newest N. Deep history belongs behind a "load older" control rather than in
 * every cold start; nobody scrolls two thousand rows.
 */
const TRANSACTION_PAGE_SIZE = 100;

/** One mapper for the first read and every realtime event after it. */
function toAppTransaction(row: any): AppTransaction {
  return {
    id: row.id,
    reference: row.reference,
    customer_id: row.customer_id,
    user_id: row.user_id,
    merchant_name: row.merchant_name,
    amount: Number(row.amount) || 0,
    status: row.status,
    account_used: row.account_used,
    created_at: row.created_at,
    service_type: row.service_type ?? null,
    provider: row.provider ?? null,
    beneficiary: row.beneficiary ?? null,
    fee_amount: row.fee_amount === null || row.fee_amount === undefined ? null : Number(row.fee_amount),
    token: row.token ?? null,
    units: row.units ?? null,
    merchant_id: row.merchant_id ?? null,
    terminal_id: row.terminal_id ?? null,
  };
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  isLoading: false,
  error: null,

  fetchTransactions: async (userId: string, customerId?: string) => {
    set({ isLoading: true, error: null });
    try {
      // And a limit. There was none, so the query returned every transaction
      // the customer had ever made; a year of daily airtime is a few thousand
      // rows fetched, parsed and mounted to draw a screen that shows five.
      let query = supabase
        .from('transactions')
        .select(TRANSACTION_LIST_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(TRANSACTION_PAGE_SIZE);

      if (customerId) {
        query = query.or(`user_id.eq.${userId},customer_id.eq.${customerId}`);
      } else {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({ transactions: (data || []).map(toAppTransaction), isLoading: false });
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
          const mapped = toAppTransaction(row);

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // A new alert (the bell's badge goes up) or one marked read on
          // another device (it comes down).
          const row = payload.new as any;
          if (row?.id) useNotificationStore.getState().upsert(toAppNotification(row));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));

/**
 * One entry in the customer's inbox. Written by the database, never by the
 * app (migration 20260927120000_customer_notifications): a purchase's outcome,
 * a palm payment, or a security event on the account.
 */
export interface AppNotification {
  id: string;
  kind: 'payment' | 'palm' | 'security';
  /** The transaction's status when this was written; null for security. */
  status: string | null;
  /** The transaction it is about, when there is one. */
  reference: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface NotificationState {
  notifications: AppNotification[];
  isLoading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  /** Mark these read, or every unread one when no ids are given. */
  markRead: (ids?: string[]) => Promise<void>;
  /** Add or replace one, from a realtime event. */
  upsert: (notification: AppNotification) => void;
}

const NOTIFICATION_COLUMNS = 'id, kind, status, reference, title, body, created_at, read_at';

/** The inbox is a recent-history view, like the transaction list. */
const NOTIFICATION_PAGE_SIZE = 100;

function toAppNotification(row: any): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status ?? null,
    reference: row.reference ?? null,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    read_at: row.read_at ?? null,
  };
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isLoading: false,
  error: null,

  fetchNotifications: async () => {
    set({ isLoading: true, error: null });
    // Row security limits this to the signed-in customer's own entries.
    const { data, error } = await supabase
      .from('customer_notifications')
      .select(NOTIFICATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE);

    if (error) {
      console.warn('[notifications] could not load', error.message);
      set({ error: error.message, isLoading: false });
      return;
    }
    set({ notifications: (data || []).map(toAppNotification), isLoading: false });
  },

  markRead: async (ids) => {
    const now = new Date().toISOString();
    const targets = ids ? new Set(ids) : null;
    const before = get().notifications;
    // At once, so the dot and the badge clear under the finger; the server
    // write follows. If it fails the list is read again, so a stale "read"
    // never sticks.
    set({
      notifications: before.map((n) =>
        !n.read_at && (!targets || targets.has(n.id)) ? { ...n, read_at: now } : n,
      ),
    });
    const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
    if (error) {
      console.warn('[notifications] could not mark read', error.message);
      await get().fetchNotifications();
    }
  },

  upsert: (notification) => {
    set((state) => {
      const index = state.notifications.findIndex((n) => n.id === notification.id);
      if (index === -1) {
        return { notifications: [notification, ...state.notifications] };
      }
      const next = [...state.notifications];
      next[index] = notification;
      return { notifications: next };
    });
  },
}));
