import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useSupportStore, type AppTransaction } from '../../store/useStore';
import { naira2 } from '../../lib/purchaseForm';

/**
 * "Get help" on a transaction: opens a support chat that already names the
 * purchase and its reference, so the customer does not have to find them and
 * support does not have to ask.
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
      navigation.navigate('MeTab', { screen: 'SupportScreen' });
    },
    [startNewChat, navigation, beforeLeave],
  );
}
