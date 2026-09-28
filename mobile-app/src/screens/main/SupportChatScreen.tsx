import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { CheckCheck, ChevronLeft, Headphones, Send, ShieldCheck } from 'lucide-react-native';

import { IconButton, PressScale } from '../../components/ds';
import { useSupportStore, type SupportMessage } from '../../store/useStore';
import { useThemeColors } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import { CHAT_STATUS, bubbleTime, supportState } from '../../lib/supportView';

/**
 * A support chat (design handoff, screen 14): the customer's messages on the
 * right in brand green, the agent's on the left with a headset, system notes
 * in the middle, the agent's typing dots, and — once solved — a closed chat.
 *
 * Opened with a ticket to continue it, or with none to start one: the chat is
 * created when the customer sends their first message.
 */
export default function SupportChatScreen({ navigation, route }: any) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const ticketId: string | undefined = route?.params?.ticketId;

  const ticket = useSupportStore((s) => s.activeTicket);
  const activeTicketId = useSupportStore((s) => s.activeTicketId);
  const messages = useSupportStore((s) => s.messages);
  const agentTyping = useSupportStore((s) => s.agentTyping);
  const selectChat = useSupportStore((s) => s.selectChat);
  const leaveChat = useSupportStore((s) => s.leaveChat);
  const sendMessage = useSupportStore((s) => s.sendMessage);
  const startNewChat = useSupportStore((s) => s.startNewChat);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (ticketId) void selectChat(ticketId);
    return () => leaveChat();
  }, [ticketId]);

  const shown = activeTicketId ? ticket : null;
  const state = shown ? supportState(shown) : null;
  const solved = state === 'resolved';
  const statusColour =
    state === 'resolved' ? c.muted : state === 'escalated' ? c.warn : state === 'waiting' ? '#3B82F6' : c.brandText;
  const spoken = messages.filter((m) => m.sender_type !== 'system');

  const send = async () => {
    const body = text.trim();
    if (!body || sending || solved) return;
    setSending(true);
    setFailed(false);
    const ok = activeTicketId ? await sendMessage(body) : Boolean(await startNewChat(body));
    setSending(false);
    if (ok) setText('');
    else setFailed(true);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <IconButton icon={ChevronLeft} label="Back" onPress={() => navigation.goBack()} />
          <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <Text accessibilityRole="header" style={{ color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
              {shown?.ticket_id ? `Ticket ${shown.ticket_id}` : 'MiliPay support'}
            </Text>
            {state ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColour }} />
                <Text style={{ color: statusColour, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.44, textTransform: 'uppercase' }}>
                  {CHAT_STATUS[state]}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardLine,
            }}
          >
            <ShieldCheck color={c.brand} size={13} />
            <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Private support session</Text>
          </View>

          {shown?.ticket_id ? <SystemNote text={`Chat started · Ticket ${shown.ticket_id}`} /> : null}

          {spoken.length === 0 ? (
            <View
              style={{
                marginTop: 8,
                marginHorizontal: 12,
                padding: 22,
                borderRadius: 20,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.cardLine,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Headphones color={c.brand} size={30} />
              <Text style={{ marginTop: 4, color: c.text, fontSize: 16, fontFamily: 'Inter_700Bold' }}>Welcome to MiliPay support</Text>
              <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                Tell us what you need help with below. An agent will reply in under 5 minutes.
              </Text>
            </View>
          ) : null}

          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}

          {agentTyping && !solved ? <TypingDots /> : null}

          {solved ? (
            <View
              style={{
                marginTop: 6,
                padding: 16,
                borderRadius: 18,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.cardLine,
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCheck color={c.brand} size={24} />
              <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_700Bold' }}>This issue was marked as solved</Text>
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                This conversation is closed. For more help, go back and start a new chat.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom + 10, 20),
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.card,
          }}
        >
          {solved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 18, backgroundColor: c.chip }}>
              <CheckCheck color={c.brand} size={17} />
              <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_500Medium' }}>This ticket has been solved. Chat is closed.</Text>
            </View>
          ) : (
            <View>
              {failed ? (
                <Text style={{ marginBottom: 6, color: c.fail, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                  Your message wasn't sent. Check your connection and try again.
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: c.input, borderWidth: 1, borderColor: c.line, justifyContent: 'center', paddingHorizontal: 16 }}>
                  <TextInput
                    value={text}
                    onChangeText={(t) => {
                      setText(t);
                      setFailed(false);
                    }}
                    placeholder="Type your message…"
                    placeholderTextColor={c.faint}
                    onSubmitEditing={() => void send()}
                    returnKeyType="send"
                    accessibilityLabel="Message"
                    style={{ padding: 0, color: c.text, fontSize: 15, fontFamily: 'Inter_400Regular' }}
                  />
                </View>
                <PressScale
                  scaleTo={0.92}
                  onPress={() => void send()}
                  disabled={!text.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: text.trim() ? '#00C896' : c.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  <Send color={text.trim() ? brandFixed.onBrand : c.faint} size={19} />
                </PressScale>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SystemNote({ text }: { text: string }) {
  const c = useThemeColors();
  return (
    <View style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.chip, maxWidth: '90%' }}>
      <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function AgentAvatar() {
  const c = useThemeColors();
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Headphones color={c.brandText} size={14} />
    </View>
  );
}

function Bubble({ message }: { message: SupportMessage }) {
  const c = useThemeColors();
  if (message.sender_type === 'system') return <SystemNote text={message.content} />;

  if (message.sender_type === 'staff') {
    return (
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', maxWidth: '84%' }}>
        <AgentAvatar />
        <View
          style={{
            flexShrink: 1,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderBottomRightRadius: 20,
            borderBottomLeftRadius: 6,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardLine,
            boxShadow: c.shadow,
          }}
        >
          <Text selectable style={{ color: c.text, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' }}>{message.content}</Text>
          <Text style={{ marginTop: 4, color: c.faint, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{bubbleTime(message.created_at)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '78%',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 6,
        borderBottomLeftRadius: 20,
        backgroundColor: '#00C896',
      }}
    >
      <Text selectable style={{ color: brandFixed.onBrand, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' }}>{message.content}</Text>
      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, opacity: 0.7 }}>
        <Text style={{ color: brandFixed.onBrand, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{bubbleTime(message.created_at)}</Text>
        <CheckCheck color={brandFixed.onBrand} size={12} />
      </View>
    </View>
  );
}

/** Three dots pulsing one after another (the prototype's `pulse`, 1 s, .15 s apart). */
function TypingDots() {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }} accessibilityLabel="Agent is typing">
      <AgentAvatar />
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 20,
          borderBottomLeftRadius: 6,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardLine,
        }}
      >
        {[0, 150, 300].map((delay) => (
          <Dot key={delay} delay={delay} colour={c.faint} />
        ))}
      </View>
    </View>
  );
}

function Dot({ delay, colour }: { delay: number; colour: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 500 })), -1));
    return () => cancelAnimation(t);
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - 0.25 * t.value, transform: [{ scale: 1 + 0.07 * t.value }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colour }, style]} />;
}
