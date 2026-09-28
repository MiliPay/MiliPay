import React, { createContext, useCallback, useContext, useState } from 'react';
import { Alert } from 'react-native';
import { MonoProvider, useMonoConnect } from '@mono.co/connect-react-native';

import { ConfirmIdentitySheet } from '../ui/ConfirmIdentitySheet';
import { useAuthStore, useBankStore } from '../../store/useStore';

/** The prototype links at most three accounts. */
export const MAX_LINKED = 3;

const LinkContext = createContext<{ startLink: () => void } | null>(null);

/**
 * Linking a bank, wherever it starts: Home's "Link bank account" card and
 * Me › Linked banks › "Link another account".
 *
 * The design draws its own bank picker and bank login; MiliPay never collects
 * bank credentials, so this opens Mono's real widget instead (decision 1) —
 * after the "Confirm it's you" check, as the design has it.
 */
export function BankLinkingProvider({
  onLinked,
  children,
}: {
  /** Called once the new account is saved and the list re-read. */
  onLinked?: () => void;
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const linkMonoAccount = useBankStore((s) => s.linkMonoAccount);

  // Mono records this as the identity behind the bank connection, and under
  // the Direct Debit model it is the identity a mandate is signed against. It
  // used to fall back to "Test User" / "test@biopay.app", so a customer whose
  // session carried no email linked a real bank account under a placeholder.
  // startLink below stops the widget opening at all in that case.
  const monoConfig = {
    publicKey: process.env.EXPO_PUBLIC_MONO_PUBLIC_KEY || '',
    scope: 'auth',
    data: {
      customer: {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(),
        email: user?.email ?? '',
      },
    },
    onClose: () => {},
    onSuccess: async (data: any) => {
      try {
        await linkMonoAccount(data.getAuthCode());
        onLinked?.();
      } catch (err) {
        console.error('Mono link error', err);
        Alert.alert('Could not link account', err instanceof Error ? err.message : 'Please try again.');
      }
    },
  };

  return (
    <MonoProvider {...monoConfig}>
      <LinkController>{children}</LinkController>
    </MonoProvider>
  );
}

function LinkController({ children }: { children: React.ReactNode }) {
  const { init } = useMonoConnect();
  const user = useAuthStore((s) => s.user);
  const accounts = useBankStore((s) => s.linkedAccounts);
  const [confirming, setConfirming] = useState(false);

  /**
   * Linking a bank account is a sensitive action, so it is gated on the
   * device fingerprint with the MiliPay PIN as the fallback: anyone holding an
   * unlocked handset must not be able to attach an account.
   *
   * Mono ties the connection to the name and email we hand over. Refusing to
   * link is recoverable; linking a real bank account under a placeholder
   * identity is not.
   */
  const startLink = useCallback(() => {
    if (accounts.length >= MAX_LINKED) {
      Alert.alert('Limit reached', 'You can link up to 3 bank accounts. Remove one to link another.');
      return;
    }
    const hasCompleteIdentity = Boolean(user?.email?.trim() && user?.firstName?.trim() && user.firstName !== 'User');
    if (!hasCompleteIdentity) {
      Alert.alert(
        'We need your details first',
        'Your bank has to match this account to your full name and email address, and we do not have both on file. Contact support or the agent who enrolled you, then try again.',
      );
      return;
    }
    setConfirming(true);
  }, [accounts.length, user]);

  return (
    <LinkContext.Provider value={{ startLink }}>
      {children}
      <ConfirmIdentitySheet
        visible={confirming}
        reason="Confirm it is you before linking a bank account to MiliPay."
        onConfirmed={() => {
          setConfirming(false);
          init();
        }}
        onCancel={() => setConfirming(false)}
      />
    </LinkContext.Provider>
  );
}

export function useBankLinking() {
  const value = useContext(LinkContext);
  if (!value) throw new Error('useBankLinking must be used inside BankLinkingProvider');
  return value;
}
