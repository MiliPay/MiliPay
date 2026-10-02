import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Clock, Headphones, MessageSquarePlus } from 'lucide-react-native';

import { IconButton, PressScale } from '../../components/ds';
import { Tap } from '../../components/ds/Tap';
import { useSupportStore } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { FAQ, SUPPORT_BADGE, agoLabel, chatCount, supportState, type BadgeTone, type FaqId } from '../../lib/supportView';

/**
 * Help & support (design handoff, screen 14): "Talk to support" to start a
 * chat, quick answers that open in place, and the customer's past
 * conversations with where each one stands.
 */
export default function SupportScreen({ navigation }: any) {
  const c = useThemeColors();
  const conversations = useSupportStore((s) => s.conversations);
  const fetchConversations = useSupportStore((s) => s.fetchConversations);
  const isLoading = useSupportStore((s) => s.isLoading);
  const [faq, setFaq] = useState<FaqId | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchConversations();
    }, [fetchConversations]),
  );

  const startChat = () => navigation.navigate('SupportChat', {});
  const open = FAQ.find((f) => f.id === faq);

  const badgeColours = (tone: BadgeTone): [string, string] =>
    tone === 'blue' ? ['rgba(59, 130, 246, 0.14)', '#3B82F6']
    : tone === 'brand' ? [c.brandSoft, c.brandText]
    : tone === 'warn' ? [c.warnSoft, c.warn]
    : [c.chip, c.muted];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingHorizontal: 16 }}>
        <IconButton icon={ChevronLeft} label="Back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 17, fontFamily: 'Inter_700Bold' }}>
            Help & support
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#00C896', boxShadow: '0px 0px 6px #00C896' }} />
            <Text style={{ color: c.brandText, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Replies in under 5 mins</Text>
          </View>
        </View>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <PressScale
          scaleTo={0.99}
          onPress={startChat}
          accessibilityRole="button"
          accessibilityLabel="Talk to support. Start a new chat."
          style={{ marginTop: 18, marginHorizontal: 20, borderRadius: 26, boxShadow: '0px 14px 30px -14px rgba(6, 95, 70, 0.7)' }}
        >
          <LinearGradient
            colors={brandFixed.heroGradient as unknown as [string, string, string]}
            locations={brandFixed.heroGradientStops as unknown as [number, number, number]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 20, borderRadius: 26, overflow: 'hidden' }}
          >
            <View style={{ position: 'absolute', right: -70, top: -90, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center' }}>
                <Headphones color={brandFixed.onBrand} size={26} />
              </View>
              <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(51,224,181,0.18)' }}>
                <Text style={{ color: '#33E0B5', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 }}>24/7 LIVE SUPPORT</Text>
              </View>
            </View>
            <Text style={{ marginTop: 14, color: '#FFFFFF', fontSize: 22, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.44 }}>Talk to support</Text>
            <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' }}>
              Have an issue with a terminal payment, bank account or bill? Chat with our support team.
            </Text>
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 16,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: '#00C896',
              }}
            >
              <MessageSquarePlus color={brandFixed.onBrand} size={16} />
              <Text style={{ color: brandFixed.onBrand, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Start a new chat</Text>
            </View>
          </LinearGradient>
        </PressScale>

        <Text
          style={{
            marginTop: 22,
            marginHorizontal: 20,
            color: c.faint,
            fontSize: 12,
            fontFamily: 'Inter_600SemiBold',
            letterSpacing: 0.96,
            textTransform: 'uppercase',
          }}
        >
          Quick answers
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 10 }}>
          {FAQ.map((q) => {
            const on = faq === q.id;
            return (
              <PressScale
                key={q.id}
                onPress={() => setFaq(on ? null : q.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: on }}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: on ? c.brand : c.cardLine,
                  backgroundColor: on ? c.brandSoft : c.card,
                }}
              >
                <Text style={{ color: on ? c.brandText : c.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{q.label}</Text>
              </PressScale>
            );
          })}
        </ScrollView>
        {open ? (
          <View
            style={{
              marginTop: 10,
              marginHorizontal: 20,
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: c.card,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: c.cardLine,
              boxShadow: c.shadow,
            }}
          >
            <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{open.title}</Text>
            <Text style={{ marginTop: 4, color: c.muted, fontSize: 13, lineHeight: 19.5, fontFamily: 'Inter_400Regular' }}>{open.body}</Text>
            <Tap onPress={startChat} accessibilityRole="button" hitSlop={12} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
              <Text style={{ color: c.brandText, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Still need help? Chat with us</Text>
              <ChevronRight color={c.brandText} size={14} />
            </Tap>
          </View>
        ) : null}

        <View style={{ marginTop: 24, marginHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.16 }}>
            Recent conversations
          </Text>
          <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{chatCount(conversations.length)}</Text>
        </View>
        <View style={{ marginTop: 10, marginHorizontal: 20, gap: 10 }}>
          {conversations.map((conv) => {
            const badge = SUPPORT_BADGE[supportState(conv)];
            const [bg, fg] = badgeColours(badge.tone);
            return (
              <Tap
                key={conv.id}
                onPress={() => navigation.navigate('SupportChat', { ticketId: conv.id })}
                accessibilityRole="button"
                accessibilityLabel={`${conv.ticket_id ?? 'Chat'}, ${badge.label}. Open chat.`}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  backgroundColor: pressed ? c.chip : c.card,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: c.cardLine,
                  boxShadow: c.shadow,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{conv.ticket_id ?? 'Chat'}</Text>
                  <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7, backgroundColor: bg }}>
                    <Text style={{ color: fg, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.4, textTransform: 'uppercase' }}>{badge.label}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: c.faint, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{agoLabel(conv.updated_at)}</Text>
                </View>
                <Text numberOfLines={2} style={{ marginTop: 6, color: c.muted, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' }}>
                  {conv.last_message || 'New conversation'}
                </Text>
                <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: c.brandText, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Open chat</Text>
                  <ChevronRight color={c.brandText} size={14} />
                </View>
              </Tap>
            );
          })}
          {conversations.length === 0 && !isLoading ? (
            <View
              style={{
                paddingVertical: 28,
                paddingHorizontal: 20,
                borderRadius: 18,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.line,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Clock color={c.faint} size={26} />
              <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>No previous chats</Text>
              <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                When you talk to support, your conversations are saved here.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
