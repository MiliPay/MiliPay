import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Mail, MessageCircle, MessageSquare, PhoneCall } from 'lucide-react-native';
import { PressScale } from './ds';
import { useThemeColors } from '../theme/useThemeColors';
import {
  CHANNEL_LABEL,
  fetchChannelMenu,
  initialChannel,
  rememberChannel,
  rememberedChannel,
  type CodeChannel,
  type CodePurpose,
} from '../lib/codeChannels';

const ICON = { sms: MessageSquare, call: PhoneCall, email: Mail, whatsapp: MessageCircle } as const;

/**
 * The ways a code can come for this purpose, and the one picked (the last
 * one this phone used, else SMS). Picking one remembers it.
 */
export function useCodeChannel(purpose: CodePurpose) {
  const [offered, setOffered] = useState<CodeChannel[]>(['sms']);
  const [channel, setChannel] = useState<CodeChannel>('sms');
  useEffect(() => {
    let live = true;
    void Promise.all([fetchChannelMenu(), rememberedChannel()]).then(([menu, remembered]) => {
      if (!live) return;
      setOffered(menu[purpose]);
      setChannel(initialChannel(menu[purpose], remembered));
    });
    return () => {
      live = false;
    };
  }, [purpose]);
  const pick = (c: CodeChannel) => {
    setChannel(c);
    void rememberChannel(c);
  };
  return { offered, channel, pick };
}

/** "Get the code by": one tile per way, the picked one highlighted. Hidden when SMS is the only way. */
export function CodeChannelPicker({
  offered,
  value,
  onChange,
  label = 'Get the code by',
  disabled,
}: {
  offered: CodeChannel[];
  value: CodeChannel;
  onChange: (c: CodeChannel) => void;
  label?: string;
  disabled?: boolean;
}) {
  const c = useThemeColors();
  if (offered.length < 2) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{label}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
        {offered.map((ch) => {
          const on = ch === value;
          const Icon = ICON[ch];
          return (
            <PressScale
              key={ch}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
              accessibilityLabel={CHANNEL_LABEL[ch]}
              disabled={disabled}
              onPress={() => onChange(ch)}
              style={{
                flex: 1,
                minHeight: 56,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: on ? c.brand : c.line,
                backgroundColor: on ? c.brandSoft : c.card,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                paddingVertical: 8,
              }}
            >
              <Icon size={18} color={on ? c.brandText : c.muted} />
              <Text style={{ color: on ? c.brandText : c.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{CHANNEL_LABEL[ch]}</Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}
