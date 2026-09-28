import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useSupportStore, type AppTransaction } from '../../store/useStore';
import { naira2 } from '../../lib/purchaseForm';

/**
 * "Get help" on a transaction: starts a support chat whose first message
 * already names the purchase and its reference, and opens it — so the
 * customer does not have to find them and support does not have to ask.
 */
export function useTxHelp(navigation: any, beforeLeave?: () => void) {
  const startNewChat = useSupportStore((s) => s.startNewChat);
  return useCallback(
    async (tx: AppTransaction) => {
      const id = await startNewChat(
        `I need help with ${tx.merchant_name || 'a payment'} (${naira2(tx.amount)}), reference ${tx.reference}.`,
      );
      if (!id) {
        Alert.alert("Couldn't start a chat", 'Check your connection and try again.');
        return;
      }
      beforeLeave?.();
      navigation.navigate('MeTab', { screen: 'SupportChat', params: { ticketId: id }, initial: false });
    },
    [startNewChat, navigation, beforeLeave],
  );
}
