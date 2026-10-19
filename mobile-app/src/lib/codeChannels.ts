import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { SMS_ONLY, readMenu, type ChannelMenu, type CodeChannel } from './codeChannelView';

export * from './codeChannelView';

/** Asking the server which ways are on, and remembering the last one picked. */

const ALL: CodeChannel[] = ['sms', 'call', 'email', 'whatsapp'];

export async function fetchChannelMenu(): Promise<ChannelMenu> {
  try {
    const { data, error } = await supabase.functions.invoke('login-code', { body: { action: 'channels' } });
    if (error || !data?.success) return SMS_ONLY;
    return readMenu(data.channels);
  } catch {
    return SMS_ONLY;
  }
}

const KEY = 'milipay.codeChannel';

export async function rememberedChannel(): Promise<CodeChannel | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return ALL.includes(v as CodeChannel) ? (v as CodeChannel) : null;
  } catch {
    return null;
  }
}

export async function rememberChannel(channel: CodeChannel): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, channel);
  } catch {
    // Only a convenience.
  }
}
