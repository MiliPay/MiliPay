import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  ScrollView, 
  Pressable, 
  Platform, 
  StyleSheet, 
  useColorScheme, 
  KeyboardAvoidingView,
  RefreshControl,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  ChevronLeft, 
  Send, 
  Headphones, 
  CheckCheck, 
  MessageSquarePlus, 
  Clock, 
  ChevronRight, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  CreditCard,
  ArrowRight
} from 'lucide-react-native';
import { useSupportStore, SupportConversation } from '../../store/useStore';
import * as Haptics from 'expo-haptics';

export default function SupportScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  
  const conversations = useSupportStore((s) => s.conversations);
  const activeTicket = useSupportStore((s) => s.activeTicket);
  const activeTicketId = useSupportStore((s) => s.activeTicketId);
  const messages = useSupportStore((s) => s.messages);
  const isLoading = useSupportStore((s) => s.isLoading);
  const isLoadingMessages = useSupportStore((s) => s.isLoadingMessages);
  const fetchConversations = useSupportStore((s) => s.fetchConversations);
  const startNewChat = useSupportStore((s) => s.startNewChat);
  const selectChat = useSupportStore((s) => s.selectChat);
  const leaveChat = useSupportStore((s) => s.leaveChat);
  const sendMessage = useSupportStore((s) => s.sendMessage);

  const [inputText, setInputText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Safe Auto-Scroll in chat view
  useEffect(() => {
    if (activeTicketId) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, activeTicketId]);

  // Auto-scroll when keyboard appears so typing area and messages are visible
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
    );
    return () => {
      showSub.remove();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const handleStartChat = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await startNewChat();
  };

  const handleSelectConversation = (conv: SupportConversation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    selectChat(conv.id);
  };

  const handleBack = () => {
    if (activeTicketId) {
      leaveChat();
    } else {
      navigation.goBack();
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = inputText.trim();
    setInputText('');
    await sendMessage(text);
  };

  const hasText = inputText.trim().length > 0;

  // --- Dynamic Theme Colors ---
  const bgMain = isDark ? '#020617' : '#f8fafc';
  const bgHeader = isDark ? 'rgba(2, 6, 23, 0.95)' : 'rgba(248, 250, 252, 0.95)';
  const bgInputArea = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const cardBg = isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.85)';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  
  const textPrimary = isDark ? '#ffffff' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  
  const borderSubtle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const borderButton = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  
  const agentBubbleBg = isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff';
  const agentBubbleBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const agentBubbleText = isDark ? '#f1f5f9' : '#1e293b';

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ─────────────────────────────────────────────────────────────
  // VIEW 1: SUPPORT HUB (LANDING VIEW)
  // ─────────────────────────────────────────────────────────────
  if (!activeTicketId) {
    return (
      <View style={{ flex: 1, backgroundColor: bgMain }}>
        <LinearGradient 
          colors={isDark ? ['rgba(0, 200, 150, 0.08)', 'rgba(2, 6, 23, 1)'] : ['rgba(0, 200, 150, 0.06)', '#f8fafc']} 
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={{ paddingTop: insets.top, backgroundColor: bgHeader, borderBottomWidth: 1, borderBottomColor: borderSubtle, zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
            <Pressable 
              onPress={handleBack}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: borderButton, borderColor: borderSubtle }}
            >
              <ChevronLeft color={textPrimary} size={24} />
            </Pressable>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 18 }}>Help & Support</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C896', marginRight: 6, shadowColor: '#00C896', shadowOpacity: 0.8, shadowRadius: 8, elevation: 2 }} />
                <Text style={{ color: '#00C896', fontWeight: '600', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Replies under 5 mins
                </Text>
              </View>
            </View>

            <View style={{ width: 40 }} />
          </View>
        </View>

        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00C896" />}
        >
          {/* Main "Talk to Support" CTA Banner */}
          <Pressable 
            onPress={handleStartChat}
            style={({ pressed }) => [
              {
                borderRadius: 24,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(0, 200, 150, 0.3)' : 'rgba(0, 200, 150, 0.25)',
                shadowColor: '#00C896',
                shadowOpacity: isDark ? 0.15 : 0.08,
                shadowRadius: 16,
                elevation: 4,
                transform: [{ scale: pressed ? 0.98 : 1 }]
              }
            ]}
          >
            <LinearGradient
              colors={isDark ? ['rgba(0, 200, 150, 0.15)', 'rgba(15, 23, 42, 0.85)'] : ['rgba(0, 200, 150, 0.12)', 'rgba(255, 255, 255, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 22 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#00C896', alignItems: 'center', justifyContent: 'center', shadowColor: '#00C896', shadowOpacity: 0.4, shadowRadius: 10, elevation: 3 }}>
                  <Headphones color="#ffffff" size={26} />
                </View>

                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0, 200, 150, 0.15)', borderWidth: 1, borderColor: 'rgba(0, 200, 150, 0.3)' }}>
                  <Text style={{ color: '#00C896', fontWeight: '700', fontSize: 11 }}>24/7 LIVE SUPPORT</Text>
                </View>
              </View>

              <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 22, marginTop: 16 }}>
                Talk to Support
              </Text>
              <Text style={{ color: textSecondary, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
                Have an issue with a POS payment, bank account, or transfer? Connect instantly with our dedicated support staff.
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(0, 200, 150, 0.2)' : '#00C896', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 }}>
                <MessageSquarePlus color="#ffffff" size={16} style={{ marginRight: 6 }} />
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Start a New Chat</Text>
              </View>
            </LinearGradient>
          </Pressable>

          {/* Quick FAQ / Topics */}
          <View style={{ marginTop: 24 }}>
            <Text style={{ color: textSecondary, fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Quick Answers
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {['Stuck Transfer', 'Unlink Bank', 'Biometrics / PIN', 'Daily Limits'].map((topic, i) => (
                <View 
                  key={i} 
                  style={{ 
                    paddingHorizontal: 14, 
                    paddingVertical: 10, 
                    borderRadius: 14, 
                    backgroundColor: cardBg, 
                    borderWidth: 1, 
                    borderColor: cardBorder 
                  }}
                >
                  <Text style={{ color: textPrimary, fontSize: 13, fontWeight: '500' }}>{topic}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Recent Conversations List */}
          <View style={{ marginTop: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 18 }}>
                Recent Conversations
              </Text>
              <Text style={{ color: textSecondary, fontSize: 13 }}>
                {conversations.length} {conversations.length === 1 ? 'chat' : 'chats'}
              </Text>
            </View>

            {isLoading && conversations.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator color="#00C896" />
                <Text style={{ color: textSecondary, fontSize: 13, marginTop: 8 }}>Loading your conversations...</Text>
              </View>
            ) : conversations.length === 0 ? (
              <View style={{ 
                padding: 32, 
                borderRadius: 20, 
                borderWidth: 1, 
                borderColor: cardBorder, 
                borderStyle: 'dashed', 
                alignItems: 'center', 
                backgroundColor: cardBg 
              }}>
                <Clock color={textSecondary} size={28} style={{ opacity: 0.6 }} />
                <Text style={{ color: textPrimary, fontWeight: '600', fontSize: 15, marginTop: 12 }}>No Previous Chats</Text>
                <Text style={{ color: textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  Whenever you talk to support, your conversations will be archived here for your reference.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {conversations.map((conv) => {
                  const isResolved = conv.status === 'resolved';
                  const isInProgress = conv.status === 'in_progress';
                  const isEscalated = conv.is_escalated;
                  
                  let badgeBg = 'rgba(59, 130, 246, 0.15)';
                  let badgeColor = '#3b82f6';
                  let badgeLabel = 'Waiting for Agent';

                  if (isResolved) {
                    badgeBg = isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)';
                    badgeColor = isDark ? '#94a3b8' : '#64748b';
                    badgeLabel = 'Solved';
                  } else if (isEscalated) {
                    badgeBg = 'rgba(245, 158, 11, 0.15)';
                    badgeColor = '#f59e0b';
                    badgeLabel = 'Escalated to Admin';
                  } else if (isInProgress) {
                    badgeBg = 'rgba(0, 200, 150, 0.15)';
                    badgeColor = '#00C896';
                    badgeLabel = 'In Progress';
                  }

                  return (
                    <Pressable
                      key={conv.id}
                      onPress={() => handleSelectConversation(conv)}
                      style={({ pressed }) => [
                        {
                          padding: 16,
                          borderRadius: 18,
                          backgroundColor: cardBg,
                          borderWidth: 1,
                          borderColor: cardBorder,
                          opacity: pressed ? 0.8 : 1,
                        }
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 15 }}>
                            {conv.ticket_id || 'Support Chat'}
                          </Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: badgeBg }}>
                            <Text style={{ color: badgeColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                              {badgeLabel}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ color: textSecondary, fontSize: 11 }}>
                          {formatTime(conv.updated_at)}
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={{ color: textSecondary, fontSize: 13, lineHeight: 18 }}>
                        {conv.last_message || conv.issue_description}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                        <Text style={{ color: '#00C896', fontSize: 12, fontWeight: '600', marginRight: 4 }}>Open Chat</Text>
                        <ChevronRight color="#00C896" size={14} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW 2: ACTIVE LIVE CHAT INTERFACE
  // ─────────────────────────────────────────────────────────────
  const isResolved = activeTicket?.status === 'resolved';

  return (
    <View style={{ flex: 1, backgroundColor: bgMain }}>
      <LinearGradient 
        colors={isDark ? ['rgba(0, 200, 150, 0.05)', 'rgba(2, 6, 23, 1)'] : ['rgba(0, 200, 150, 0.04)', '#f8fafc']} 
        style={StyleSheet.absoluteFill}
      />

      {/* Chat Header */}
      <View style={{ paddingTop: insets.top, backgroundColor: bgHeader, borderBottomWidth: 1, borderBottomColor: borderSubtle, zIndex: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8 }}>
          <Pressable 
            onPress={handleBack}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: borderButton, borderColor: borderSubtle }}
          >
            <ChevronLeft color={textPrimary} size={24} />
          </Pressable>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 17 }}>
              {activeTicket?.ticket_id ? `Ticket ${activeTicket.ticket_id}` : 'MiliPay Support'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
              <View style={{ 
                width: 7, 
                height: 7, 
                borderRadius: 4, 
                backgroundColor: isResolved ? '#94a3b8' : '#00C896', 
                marginRight: 5 
              }} />
              <Text style={{ 
                color: isResolved ? textSecondary : '#00C896', 
                fontWeight: '600', 
                fontSize: 11, 
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                {isResolved ? 'Solved' : activeTicket?.is_escalated ? 'Escalated to Admin' : 'Agent Active'}
              </Text>
            </View>
          </View>

          <View style={{ width: 40 }} />
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={{ flex: 1, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Security & Encryption Banner */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              backgroundColor: cardBg, 
              paddingHorizontal: 14, 
              paddingVertical: 8, 
              borderRadius: 20, 
              borderWidth: 1, 
              borderColor: cardBorder 
            }}>
              <ShieldCheck color="#00C896" size={14} style={{ marginRight: 6 }} />
              <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '500' }}>
                End-to-end encrypted support session
              </Text>
            </View>
          </View>

          {isLoadingMessages ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator color="#00C896" />
              <Text style={{ color: textSecondary, fontSize: 13, marginTop: 8 }}>Loading messages...</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', marginHorizontal: 20, borderRadius: 20, backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
              <Headphones color="#00C896" size={32} style={{ marginBottom: 12 }} />
              <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 16 }}>Welcome to MiliPay Support</Text>
              <Text style={{ color: textSecondary, fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                Drop a message below detailing your request. An agent will attend to you in under 5 minutes.
              </Text>
            </View>
          ) : (
            messages.map((msg) => {
              if (msg.sender_type === 'system') {
                return (
                  <View key={msg.id} style={{ alignItems: 'center', marginVertical: 12 }}>
                    <View style={{ 
                      backgroundColor: cardBg, 
                      paddingHorizontal: 14, 
                      paddingVertical: 6, 
                      borderRadius: 14, 
                      borderWidth: 1, 
                      borderColor: cardBorder 
                    }}>
                      <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '500', textAlign: 'center' }}>
                        {msg.content}
                      </Text>
                    </View>
                  </View>
                );
              }

              const isUser = msg.sender_type === 'customer';
              
              return (
                <View 
                  key={msg.id} 
                  style={{ 
                    width: '100%', 
                    flexDirection: 'row', 
                    justifyContent: isUser ? 'flex-end' : 'flex-start', 
                    marginBottom: 14 
                  }}
                >
                  {!isUser && (
                    <View style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: 16, 
                      backgroundColor: 'rgba(0, 200, 150, 0.15)', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      marginRight: 8, 
                      borderWidth: 1, 
                      borderColor: 'rgba(0, 200, 150, 0.3)' 
                    }}>
                      <Headphones color="#00C896" size={14} />
                    </View>
                  )}
                  
                  <View style={{ 
                    maxWidth: '78%', 
                    paddingHorizontal: 16, 
                    paddingVertical: 12, 
                    backgroundColor: isUser ? '#00C896' : agentBubbleBg,
                    borderWidth: isUser ? 0 : 1,
                    borderColor: isUser ? 'transparent' : agentBubbleBorder,
                    borderRadius: 22,
                    borderTopRightRadius: isUser ? 4 : 22,
                    borderTopLeftRadius: isUser ? 22 : 4,
                    ...( !isDark && !isUser ? { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 } : {} )
                  }}>
                    <Text style={{ fontSize: 15, lineHeight: 21, color: isUser ? '#ffffff' : agentBubbleText }}>
                      {msg.content}
                    </Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isUser ? 'flex-end' : 'flex-start', marginTop: 4 }}>
                      <Text style={{ fontWeight: '500', fontSize: 10, color: isUser ? 'rgba(255,255,255,0.8)' : textSecondary, marginRight: 4 }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isUser && (
                        <CheckCheck color={'#ffffff'} size={12} />
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* Solved Status Banner */}
          {isResolved && (
            <View style={{ 
              marginTop: 16, 
              padding: 16, 
              borderRadius: 18, 
              backgroundColor: cardBg, 
              borderWidth: 1, 
              borderColor: cardBorder, 
              alignItems: 'center' 
            }}>
              <CheckCheck color="#00C896" size={24} style={{ marginBottom: 6 }} />
              <Text style={{ color: textPrimary, fontWeight: 'bold', fontSize: 14 }}>This Issue Was Marked As Solved</Text>
              <Text style={{ color: textSecondary, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
                This conversation is closed. If you need further assistance, please tap back and start a new chat.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Input Area / Disabled Solved State */}
        <View style={{ 
          paddingHorizontal: 16, 
          paddingTop: 12, 
          paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 16, 
          borderTopWidth: 1, 
          borderTopColor: borderSubtle, 
          backgroundColor: bgInputArea 
        }}>
          {isResolved ? (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'center', 
              backgroundColor: cardBg, 
              paddingVertical: 14, 
              paddingHorizontal: 16, 
              borderRadius: 20, 
              borderWidth: 1, 
              borderColor: cardBorder, 
              gap: 8 
            }}>
              <CheckCheck color="#00C896" size={18} />
              <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '500' }}>
                This ticket has been solved. Chat is closed.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <View style={{ 
                flex: 1, 
                minHeight: 48, 
                maxHeight: 120, 
                paddingHorizontal: 16, 
                paddingTop: 12, 
                paddingBottom: 12, 
                borderWidth: 1, 
                backgroundColor: borderButton, 
                borderColor: borderSubtle, 
                borderRadius: 24 
              }}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Type your message..."
                  placeholderTextColor={textSecondary}
                  multiline
                  style={{ color: textPrimary, fontSize: 15, padding: 0, margin: 0, textAlignVertical: 'top' }}
                />
              </View>
              
              <Pressable 
                onPress={handleSendMessage}
                disabled={!hasText}
                style={[
                  { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
                  hasText 
                    ? { backgroundColor: '#00C896', shadowColor: '#00C896', shadowOpacity: 0.4, shadowRadius: 12, elevation: 4 }
                    : { backgroundColor: borderButton, borderWidth: 1, borderColor: borderSubtle }
                ]}
              >
                <Send color={hasText ? '#fff' : textSecondary} size={20} style={{ marginLeft: 2 }} />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
