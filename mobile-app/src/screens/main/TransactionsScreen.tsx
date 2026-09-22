import React, { useState, useEffect, useRef } from 'react';
import { useColorScheme } from 'nativewind';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, FileText, Zap, Smartphone, Tv, Copy, CheckCheck, CreditCard, Share2, Check, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

import { useAuthStore, useTransactionStore, useBankStore } from '../../store/useStore';
import { shareReceiptAsPdf, shareReceiptAsImage } from '../../lib/receiptSharing';
import { isMoneyReturned, rowStatus } from '../../lib/transactionStatus';

export default function TransactionsScreen({ navigation }: any) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';

  const user = useAuthStore((state) => state.user);
  const { transactions, fetchTransactions, isLoading } = useTransactionStore();
  const { linkedAccounts } = useBankStore();

  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [hasCopiedRef, setHasCopiedRef] = useState(false);
  const txReceiptRef = useRef<View>(null);

  const getAccountLabel = (accountUsed?: string | null) => {
    if (!accountUsed) return null;
    const match = linkedAccounts.find((a) => a.id === accountUsed);
    if (match) {
      return `${match.bankName} (****${match.accountNumber.slice(-4)})`;
    }
    if (accountUsed.includes('(') || accountUsed.length < 30) {
      return accountUsed;
    }
    return 'Linked Bank Account';
  };

  const [filter, setFilter] = useState<'all' | 'sent' | 'received' | 'bills'>('all');
  const [selectedBankId, setSelectedBankId] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isTxFromAccount = (tx: any, account: any) => {
    if (!account) return true;
    if (!tx.account_used) return false;
    if (tx.account_used === account.id) return true;

    const accountUsedLower = String(tx.account_used).toLowerCase();
    const bankNameLower = String(account.bankName).toLowerCase();
    const last4 = String(account.accountNumber).slice(-4);

    if (accountUsedLower.includes(bankNameLower)) return true;
    if (accountUsedLower.includes(last4)) return true;

    return false;
  };

  const formatTxDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday`;
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  useEffect(() => {
    if (user?.id) {
      fetchTransactions(user.id, user.customerId);
    }
  }, [user?.id, user?.customerId]);

  const handleFilter = (id: 'all' | 'sent' | 'received' | 'bills') => {
    Haptics.selectionAsync();
    setFilter(id);
  };

  const copyToken = async (id: string, token: string) => {
    await Clipboard.setStringAsync(token);
    Haptics.selectionAsync();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  const handleSelectTx = (tx: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTx(tx);
  };

  const handleShareSelectedPdf = async () => {
    if (!selectedTx) return;
    try {
      setIsSharingPdf(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const formattedDate = new Date(selectedTx.created_at).toLocaleString('en-NG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      await shareReceiptAsPdf({
        reference: selectedTx.reference || `MP-TXN-${selectedTx.id.slice(0, 8)}`,
        amount: Number(selectedTx.amount),
        merchant: selectedTx.merchant_name || 'MiliPay Transaction',
        beneficiary: selectedTx.recipient || selectedTx.merchant_name || 'Direct Service',
        bank: getAccountLabel(selectedTx.account_used) || 'MiliPay Linked Account',
        date: formattedDate,
        token: selectedTx.token,
        status: selectedTx.status,
      });
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleShareSelectedImage = async () => {
    if (!txReceiptRef.current) return;
    try {
      setIsSharingImage(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await shareReceiptAsImage(txReceiptRef);
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleCopyReference = async (ref: string) => {
    await Clipboard.setStringAsync(ref);
    Haptics.selectionAsync();
    setHasCopiedRef(true);
    setTimeout(() => setHasCopiedRef(false), 3000);
  };

  const filteredTransactions = transactions.filter((t) => {
    if (selectedBankId !== 'all') {
      const targetAccount = linkedAccounts.find((a) => a.id === selectedBankId);
      if (targetAccount && !isTxFromAccount(t, targetAccount)) {
        return false;
      }
    }
    if (filter === 'all') return true;
    if (filter === 'bills') return t.category === 'bills' || !t.category;
    if (filter === 'sent') return t.category === 'pos';
    if (filter === 'received') return t.category === 'received' || t.type === 'credit';
    return true;
  });

  const getTransactionIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('airtime') || lower.includes('data') || lower.includes('mtn') || lower.includes('glo') || lower.includes('airtel') || lower.includes('9mobile')) {
      return <Smartphone color="#00C896" size={20} />;
    }
    if (lower.includes('electric') || lower.includes('power') || lower.includes('ikedc') || lower.includes('ekedc') || lower.includes('aedc')) {
      return <Zap color="#f97316" size={20} />;
    }
    if (lower.includes('dstv') || lower.includes('gotv') || lower.includes('cable') || lower.includes('startimes')) {
      return <Tv color="#a855f7" size={20} />;
    }
    return <CreditCard color="#00C896" size={20} />;
  };

  const FilterButton = ({ id, label }: { id: any, label: string }) => (
    <Pressable 
      onPress={() => handleFilter(id)} 
      className={`px-5 py-2 rounded-full mr-3 ${filter === id ? 'bg-signal/20 border border-signal/50' : 'bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/10 dark:active:bg-white/20'}`}
    >
      <Text className={`${filter === id ? 'text-signal-dim dark:text-signal-bright font-inter-semibold' : 'text-slate-500 dark:text-white/60 font-inter-medium'} text-xs tracking-wide`}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-black">
      <LinearGradient colors={isDark ? ['rgba(0, 200, 150, 0.08)', '#000'] : ['rgba(0, 200, 150, 0.08)', '#f8fafc']} className="absolute inset-0" />
      
      {/* Header. This screen is both a tab root and a push target from Home, so
          the back button only appears when there is somewhere to go back to. */}
      <View className="px-6 pt-6 pb-4 flex-row items-center">
        {navigation.canGoBack() && (
          <Pressable
            onPress={() => navigation.goBack()}
            className="w-10 h-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 border border-slate-200 dark:border-white/10 active:bg-black/10 dark:active:bg-white/20 mr-4"
          >
            <ChevronLeft color={isDark ? "#fff" : "#000"} size={20} />
          </Pressable>
        )}
        <Text className="text-slate-900 dark:text-white font-inter-bold text-xl">Transactions</Text>
      </View>

      {/* Bank Filter Bar (if linked accounts exist) */}
      {linkedAccounts.length > 0 && (
        <View className="pt-1 pb-2.5">
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            <Pressable 
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedBankId('all');
              }} 
              className={`px-4 py-1.5 rounded-full mr-2.5 border ${
                selectedBankId === 'all' 
                  ? 'bg-signal/20 border-signal/50' 
                  : 'bg-black/5 dark:bg-white/10 border-slate-200 dark:border-white/10 active:opacity-60'
              }`}
            >
              <Text className={`${selectedBankId === 'all' ? 'text-signal-bright font-inter-semibold' : 'text-slate-500 dark:text-white/60 font-inter-medium'} text-xs tracking-wide`}>
                All Banks
              </Text>
            </Pressable>
            {linkedAccounts.map((account) => {
              const isSelected = selectedBankId === account.id;
              return (
                <Pressable 
                  key={account.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedBankId(account.id);
                  }} 
                  className={`px-4 py-1.5 rounded-full mr-2.5 border ${
                    isSelected 
                      ? 'bg-signal/20 border-signal/50' 
                      : 'bg-black/5 dark:bg-white/10 border-slate-200 dark:border-white/10 active:opacity-60'
                  }`}
                >
                  <Text className={`${isSelected ? 'text-signal-bright font-inter-semibold' : 'text-slate-500 dark:text-white/60 font-inter-medium'} text-xs tracking-wide`}>
                    {account.bankName} (****{account.accountNumber.slice(-4)})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Category Filters (Scrollable) */}
      <View className="pb-3 border-b border-slate-200 dark:border-white/10">
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24 }}
        >
          <FilterButton id="all" label="All" />
          <FilterButton id="bills" label="Bills & Top-up" />
          <FilterButton id="sent" label="POS Payments" />
          <FilterButton id="received" label="Received" />
        </ScrollView>
      </View>

      {/* Transactions List */}
      <ScrollView className="flex-1 px-5 pt-3" showsVerticalScrollIndicator={false}>
        {isLoading && filteredTransactions.length === 0 ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator color="#00C896" size="small" />
          </View>
        ) : filteredTransactions.length === 0 ? (
          <View className="items-center justify-center py-20 mt-10">
            <View className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/10 items-center justify-center mb-6">
              <FileText color={isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"} size={32} />
            </View>
            <Text className="text-slate-900 dark:text-white font-inter-medium text-lg text-center mb-2">No transactions found</Text>
            <Text className="text-slate-500 dark:text-white/60 font-inter text-sm text-center px-4">
              Try adjusting your bank or category filter to view matching transactions.
            </Text>
          </View>
        ) : (
          <View className="pb-12">
            {filteredTransactions.map((tx) => {
              const isCredit = tx.category === 'received' || tx.type === 'credit' || tx.direction === 'inflow';
              const badge = rowStatus(tx.status);
              // A declined or refunded payment is money the customer still has.
              // Showing it as a plain debit tells them the opposite.
              const returned = isMoneyReturned(tx.status);
              return (
                <Pressable
                  key={tx.id}
                  onPress={() => handleSelectTx(tx)}
                  className="flex-row items-center justify-between py-3.5 px-2 rounded-2xl active:opacity-60"
                >
                  <View className="flex-row items-center flex-1 mr-3">
                    {/* Circle Icon: Red ↗ for debit, Green ↙ for credit */}
                    <View className={`w-11 h-11 rounded-full items-center justify-center mr-3.5 ${
                      isCredit 
                        ? 'bg-signal/15 dark:bg-signal/20' 
                        : 'bg-rose-500/15 dark:bg-rose-500/20'
                    }`}>
                      {isCredit ? (
                        <ArrowDownLeft color="#00C896" size={18} strokeWidth={2.5} />
                      ) : (
                        <ArrowUpRight color="#f43f5e" size={18} strokeWidth={2.5} />
                      )}
                    </View>

                    <View className="flex-1">
                      <Text className="text-slate-900 dark:text-white font-inter-semibold text-base" numberOfLines={1}>
                        {tx.merchant_name}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <Text className="text-slate-400 dark:text-zinc-500 font-inter text-xs">
                          {formatTxDate(tx.created_at)}
                        </Text>
                        {getAccountLabel(tx.account_used) && (
                          <>
                            <Text className="text-slate-300 dark:text-zinc-600 mx-1.5">•</Text>
                            <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs" numberOfLines={1}>
                              {getAccountLabel(tx.account_used)}
                            </Text>
                          </>
                        )}
                      </View>
                      {badge && (
                        <View
                          className={`self-start mt-1 px-1.5 py-0.5 rounded ${
                            badge.tone === 'fail'
                              ? 'bg-status-fail/10'
                              : badge.tone === 'warn'
                              ? 'bg-status-warn/10'
                              : 'bg-black/[0.05] dark:bg-white/[0.07]'
                          }`}
                        >
                          <Text
                            className={`font-inter-medium text-[10px] ${
                              badge.tone === 'fail'
                                ? 'text-status-fail'
                                : badge.tone === 'warn'
                                ? 'text-status-warn'
                                : 'text-slate-500 dark:text-zinc-400'
                            }`}
                          >
                            {badge.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="items-end">
                    <Text
                      className={`font-mono-bold text-base ${
                        returned
                          ? 'text-slate-400 dark:text-zinc-500 line-through'
                          : isCredit
                          ? 'text-signal dark:text-signal-bright'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isCredit ? '+' : '-'}₦
                      {Number(tx.amount).toLocaleString('en-NG', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Transaction Receipt Modal (OPay Standard) */}
      <Modal
        visible={!!selectedTx}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTx(null)}
      >
        <View className="flex-1 justify-end bg-black/70">
          <View className="bg-white dark:bg-zinc-900 rounded-t-3xl max-h-[92%] border-t border-slate-200 dark:border-zinc-800 overflow-hidden">
            {/* Header bar */}
            <View className="flex-row items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <Text className="text-slate-900 dark:text-white font-inter-bold text-lg">Transaction Receipt</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTx(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
              >
                <X color={isDark ? "#fff" : "#000"} size={18} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, alignItems: 'center' }}
            >
              {/* Receipt View Captured for Image Export */}
              <View
                ref={txReceiptRef}
                collapsable={false}
                className="w-full bg-white dark:bg-zinc-900 items-center p-2 rounded-2xl"
              >
                {/* Brand / Green Badge */}
                <View className="w-20 h-20 rounded-full bg-signal/15 items-center justify-center mb-3">
                  <View
                    className="w-14 h-14 rounded-full bg-signal items-center justify-center"
                    style={{
                      shadowColor: '#00C896',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.35,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    <Check color="#000" size={28} strokeWidth={3.5} />
                  </View>
                </View>

                <View className="px-3 py-1 rounded-full bg-signal/15 mb-2">
                  <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-xs uppercase tracking-wider">
                    Transaction Successful
                  </Text>
                </View>

                <Text className="text-slate-900 dark:text-white font-inter-bold text-3xl mb-4">
                  -₦{selectedTx ? Number(selectedTx.amount).toLocaleString() : '0'}
                </Text>

                {/* STS Token card if electricity */}
                {selectedTx?.token && (
                  <View className="w-full bg-signal/10 border-2 border-dashed border-signal/40 rounded-2xl p-4 mb-4 items-center">
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-semibold text-xs mb-1 uppercase tracking-wider">
                      20-Digit Recharge Token
                    </Text>
                    <Text className="text-slate-900 dark:text-white font-inter-bold text-lg tracking-wider mb-2 text-center select-all">
                      {selectedTx.token}
                    </Text>
                    <Pressable
                      onPress={() => copyToken(selectedTx.id, selectedTx.token!)}
                      className="flex-row items-center bg-signal px-4 py-2 rounded-xl active:bg-signal"
                    >
                      {copiedId === selectedTx.id ? (
                        <>
                          <CheckCheck color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copied!</Text>
                        </>
                      ) : (
                        <>
                          <Copy color="#000" size={14} className="mr-1.5" />
                          <Text className="text-black font-inter-bold text-xs">Copy Token</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* Details Breakdown */}
                <View className="w-full rounded-2xl bg-slate-50 dark:bg-zinc-800/60 p-4 border border-slate-200/80 dark:border-zinc-700/60 mb-2">
                  <View className="flex-row justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Service</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx?.merchant_name}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Category</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx?.category === 'pos' ? 'Palm Vein POS Payment' : 'Bill Payment & Top-up'}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Payment Method</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {getAccountLabel(selectedTx?.account_used) || 'MiliPay Account'}
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Transaction Fee</Text>
                    <Text className="text-signal-dim dark:text-signal-bright font-inter-bold text-xs text-right flex-1 ml-3">
                      ₦0.00 (FREE)
                    </Text>
                  </View>

                  <View className="flex-row justify-between mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Date & Time</Text>
                    <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs text-right flex-1 ml-3">
                      {selectedTx ? new Date(selectedTx.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                    </Text>
                  </View>

                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-slate-500 dark:text-zinc-400 font-inter text-xs">Reference</Text>
                    <Pressable
                      onPress={() => selectedTx && handleCopyReference(selectedTx.reference)}
                      className="flex-row items-center flex-1 justify-end ml-3"
                    >
                      <Text className="text-slate-900 dark:text-white font-inter-semibold text-xs mr-1.5" numberOfLines={1}>
                        {selectedTx?.reference}
                      </Text>
                      {hasCopiedRef ? (
                        <CheckCheck color="#00C896" size={13} />
                      ) : (
                        <Copy color="#64748b" size={13} />
                      )}
                    </Pressable>
                  </View>

                </View>

                <Text className="text-slate-400 dark:text-zinc-600 font-inter text-[10px] text-center mt-2">
                  MiliPay Technologies Limited • Keep this reference for support
                </Text>
              </View>

              {/* Share Actions (Picture & PDF) */}
              <View className="w-full flex-row gap-2.5 mt-4 mb-3">
                <Pressable
                  onPress={handleShareSelectedPdf}
                  disabled={isSharingPdf}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingPdf ? (
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <FileText color="#00C896" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share as PDF</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleShareSelectedImage}
                  disabled={isSharingImage}
                  className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-row items-center justify-center active:bg-slate-200 dark:active:bg-zinc-700"
                >
                  {isSharingImage ? (
                    <ActivityIndicator color="#00C896" size="small" />
                  ) : (
                    <>
                      <Share2 color="#00C896" size={16} className="mr-1.5" />
                      <Text className="text-slate-800 dark:text-zinc-200 font-inter-bold text-xs">Share as Picture</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Close Button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTx(null);
                }}
                className="w-full h-14 rounded-2xl bg-signal active:bg-signal items-center justify-center shadow-md shadow-signal/20"
              >
                <Text className="text-black font-inter-bold text-base tracking-wide">Close Receipt</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
