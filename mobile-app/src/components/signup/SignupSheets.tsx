import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, IdCard, Lock, Mail, Search, ShieldCheck, type LucideIcon } from 'lucide-react-native';

import { BottomSheet, Button } from '../ds';
import { Tap } from '../ds/Tap';
import { useThemeColors } from '../../theme/useThemeColors';
import { DOB_YEARS, LGAS, MONTHS, NIN_DATA_ROWS, clampDob, filterStates, type Dob } from '../../lib/signupView';
import { SUPPORT_EMAIL } from '../../lib/brand';

/** Sheet title with a 13 pt muted line under it (the close button is the sheet's). */
function Sub({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <Text style={{ marginTop: 3, color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{children}</Text>;
}

/** "Date of birth": Day / Month / Year columns (design: years 2008 down to 1940). */
export function DobSheet({
  visible,
  value,
  onClose,
  onDone,
}: {
  visible: boolean;
  value: Dob | null;
  onClose: () => void;
  onDone: (dob: Dob) => void;
}) {
  const c = useThemeColors();
  const [draft, setDraft] = useState<Partial<Dob>>(value ?? {});
  useEffect(() => {
    if (visible) setDraft(value ?? {});
  }, [visible, value]);
  const complete = draft.d !== undefined && draft.m !== undefined && draft.y !== undefined;

  const columns: { label: string; key: keyof Dob; items: { label: string; v: number }[]; flex: number }[] = [
    { label: 'Day', key: 'd', items: Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), v: i + 1 })), flex: 0.8 },
    { label: 'Month', key: 'm', items: MONTHS.map((m, i) => ({ label: m, v: i })), flex: 1.4 },
    { label: 'Year', key: 'y', items: DOB_YEARS.map((y) => ({ label: String(y), v: y })), flex: 1 },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Date of birth">
      <Sub>As it appears on your NIN</Sub>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {columns.map((col) => (
          <View key={col.key} style={{ flex: col.flex, minWidth: 0, gap: 6 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>{col.label}</Text>
            <ScrollView
              style={{ height: 220, borderRadius: 14, backgroundColor: c.input }}
              contentContainerStyle={{ padding: 4, gap: 2 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {col.items.map((o) => {
                const on = draft[col.key] === o.v;
                return (
                  <Tap
                    key={o.v}
                    onPress={() => setDraft((d) => ({ ...d, [col.key]: o.v }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${col.label} ${o.label}`}
                    style={{ height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.brandSoft : 'transparent' }}
                  >
                    <Text style={{ color: on ? c.brandText : c.text, fontSize: 15, fontFamily: on ? 'Inter_700Bold' : 'Inter_500Medium' }}>{o.label}</Text>
                  </Tap>
                );
              })}
            </ScrollView>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 16 }}>
        <Button label="Done" disabled={!complete} onPress={() => complete && onDone(clampDob(draft as Dob))} />
      </View>
    </BottomSheet>
  );
}

function OptionRow({ label, on, first, onPress }: { label: string; on: boolean; first: boolean; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        backgroundColor: pressed ? c.chip : 'transparent',
      })}
    >
      <Text style={{ flex: 1, color: on ? c.brandText : c.text, fontSize: 15, fontFamily: on ? 'Inter_700Bold' : 'Inter_400Regular' }}>{label}</Text>
      {on ? <Check color={c.brandText} size={18} strokeWidth={2.5} /> : null}
    </Tap>
  );
}

/** "Choose your state", with a search box. */
export function StateSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (state: string) => void;
}) {
  const c = useThemeColors();
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ('');
  }, [visible]);
  const options = filterStates(q);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Choose your state">
      <View style={{ marginTop: 14, height: 48, borderRadius: 14, backgroundColor: c.input, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
        <Search color={c.faint} size={17} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search states"
          placeholderTextColor={c.faint}
          accessibilityLabel="Search states"
          style={{ flex: 1, alignSelf: 'stretch', color: c.text, fontSize: 15, fontFamily: 'Inter_400Regular' }}
        />
      </View>
      <ScrollView style={{ marginTop: 8, maxHeight: 400 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {options.map((s, i) => (
          <OptionRow key={s} label={s} on={s === value} first={i === 0} onPress={() => onPick(s)} />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** "Choose your LGA": a list where the app has one, otherwise typed. */
export function LgaSheet({
  visible,
  state,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  state: string;
  value: string;
  onClose: () => void;
  onPick: (lga: string) => void;
}) {
  const c = useThemeColors();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (visible) setTyped(value && !LGAS[state]?.includes(value) ? value : '');
  }, [visible, state, value]);
  const list = LGAS[state];
  const typedOk = typed.trim().length >= 2;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Choose your LGA">
      <Sub>{state}</Sub>
      {list ? (
        <ScrollView style={{ marginTop: 10, maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {list.map((l, i) => (
            <OptionRow key={l} label={l} on={l === value} first={i === 0} onPress={() => onPick(l)} />
          ))}
        </ScrollView>
      ) : (
        <>
          {/* The prototype only lists four states; the app says the same honestly. */}
          <Text style={{ marginTop: 14, color: c.muted, fontSize: 13, lineHeight: 18.85, fontFamily: 'Inter_400Regular' }}>
            We don't have a list of LGAs for {state} yet. Type yours below.
          </Text>
          <View
            style={{
              marginTop: 10,
              minHeight: 56,
              borderRadius: 16,
              backgroundColor: c.card,
              borderWidth: 1.5,
              borderColor: c.line,
              paddingHorizontal: 16,
              justifyContent: 'center',
            }}
          >
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Your LGA"
              placeholderTextColor={c.faint}
              accessibilityLabel="Your LGA"
              autoCapitalize="words"
              style={{ alignSelf: 'stretch', color: c.text, fontSize: 16, fontFamily: 'Inter_400Regular' }}
            />
          </View>
          <View style={{ marginTop: 14 }}>
            <Button label="Use this LGA" disabled={!typedOk} onPress={() => typedOk && onPick(typed.trim())} />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const ROW_ICONS: Record<string, LucideIcon> = { 'shield-check': ShieldCheck, 'id-card': IdCard, lock: Lock };

/** "How we use your data". */
export function NinDataSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How we use your data">
      <View style={{ gap: 14, marginTop: 16 }}>
        {NIN_DATA_ROWS.map((r) => {
          const Icon = ROW_ICONS[r.icon];
          return (
            <View key={r.text} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon color={c.brandText} size={18} />
              </View>
              <Text style={{ flex: 1, paddingTop: 2, color: c.text, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' }}>{r.text}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 20 }}>
        <Button label="Got it" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/** "Why we need a selfie". */
export function SelfieWhySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Why we need a selfie">
      <Text style={{ marginTop: 12, color: c.muted, fontSize: 15, lineHeight: 23.25, fontFamily: 'Inter_400Regular' }}>
        Our partner Smile ID matches your selfie with the photo on your NIN record, so nobody can open an account in your name. We only use
        it to check your identity and we don't share it for anything else.
      </Text>
      <View style={{ marginTop: 20 }}>
        <Button label="Got it" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/** "This isn't me": the name always comes from NIMC, so support is the way. */
export function NotMeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="This isn't me">
      <Text style={{ marginTop: 10, color: c.muted, fontSize: 15, lineHeight: 23.25, fontFamily: 'Inter_400Regular' }}>
        If these details aren't yours, contact our support team. The name on your account always comes from your NIN record, so it can't be
        changed in the app.
      </Text>
      <Tap
        onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        accessibilityRole="link"
        accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
        style={({ pressed }) => ({
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: c.line,
          backgroundColor: pressed ? c.chip : 'transparent',
        })}
      >
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Mail color={c.brandText} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>Contact</Text>
          <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>{SUPPORT_EMAIL}</Text>
        </View>
      </Tap>
      <View style={{ marginTop: 16 }}>
        <Button label="Got it" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
