import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Tap } from '../ds/Tap';
import { AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { FieldLabel, InputBox, OptionTile, Toggle } from '../ds/Form';
import { useThemeColors } from '../../theme/useThemeColors';
import { naira0 } from '../../lib/purchaseForm';

const ORANGE = '#F97316';
const PURPLE = '#A855F7';

export const DISCOS = [
  { id: 'ikedc', name: 'Ikeja Electric (IKEDC)', short: 'IKEDC' },
  { id: 'ekedc', name: 'Eko Electric (EKEDC)', short: 'EKEDC' },
  { id: 'aedc', name: 'Abuja Electric (AEDC)', short: 'AEDC' },
  { id: 'ibedc', name: 'Ibadan Electric (IBEDC)', short: 'IBEDC' },
  { id: 'phed', name: 'Port Harcourt (PHED)', short: 'PHED' },
  { id: 'eedc', name: 'Enugu Electric (EEDC)', short: 'EEDC' },
  { id: 'kedco', name: 'Kano Electric (KEDCO)', short: 'KEDCO' },
] as const;

export const CABLE_PROVIDERS = [
  { id: 'dstv', name: 'DSTV' },
  { id: 'gotv', name: 'GOtv' },
  { id: 'startimes', name: 'StarTimes' },
] as const;

/** Electricity: disco chips (orange when chosen), its full name, Prepaid · Postpaid, meter number. */
export function PowerSection({
  disco,
  onDisco,
  meterType,
  onMeterType,
  meter,
  onMeter,
}: {
  disco: string;
  onDisco: (id: string) => void;
  meterType: 'prepaid' | 'postpaid';
  onMeterType: (t: 'prepaid' | 'postpaid') => void;
  meter: string;
  onMeter: (digits: string) => void;
}) {
  const c = useThemeColors();
  return (
    <View>
      <FieldLabel>Distribution company</FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginTop: 8 }}>
        {DISCOS.map((d) => (
          <OptionTile
            key={d.id}
            label={d.name}
            selected={d.id === disco}
            tint={ORANGE}
            onPress={() => onDisco(d.id)}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14 }}
          >
            <Text style={{ color: c.text, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{d.short}</Text>
          </OptionTile>
        ))}
      </ScrollView>
      <Text style={{ marginTop: 8, marginHorizontal: 20, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
        {DISCOS.find((d) => d.id === disco)?.name ?? ''}
      </Text>
      <Toggle
        style={{ marginTop: 16, marginHorizontal: 20 }}
        value={meterType}
        onChange={onMeterType}
        options={[
          { value: 'prepaid', label: 'Prepaid' },
          { value: 'postpaid', label: 'Postpaid' },
        ]}
      />
      <FieldLabel top={18}>Meter number</FieldLabel>
      <InputBox
        value={meter}
        onChangeText={(t) => onMeter(t.replace(/[^0-9]/g, '').slice(0, 13))}
        keyboardType="number-pad"
        placeholder="11 or 13 digits"
        accessibilityLabel="Meter number"
        inputStyle={{ letterSpacing: 0.72 }}
      />
    </View>
  );
}

/** Cable: provider grid (purple when chosen) and the smartcard / IUC number. */
export function CableSection({
  provider,
  onProvider,
  card,
  onCard,
}: {
  provider: string;
  onProvider: (id: string) => void;
  card: string;
  onCard: (digits: string) => void;
}) {
  const c = useThemeColors();
  return (
    <View>
      <FieldLabel>Provider</FieldLabel>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginHorizontal: 20 }}>
        {CABLE_PROVIDERS.map((p) => (
          <OptionTile
            key={p.id}
            label={p.name}
            selected={p.id === provider}
            tint={PURPLE}
            onPress={() => onProvider(p.id)}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14 }}
          >
            <Text style={{ color: c.text, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{p.name}</Text>
          </OptionTile>
        ))}
      </View>
      <FieldLabel top={18}>Smartcard / IUC number</FieldLabel>
      <InputBox
        value={card}
        onChangeText={(t) => onCard(t.replace(/[^0-9]/g, '').slice(0, 12))}
        keyboardType="number-pad"
        placeholder="10 digits"
        accessibilityLabel="Smartcard or IUC number"
        inputStyle={{ letterSpacing: 0.72 }}
      />
    </View>
  );
}

/**
 * Whose meter or card this is, from the provider — never before it answers.
 * "Checking this account…", then the holder's name (and address, or current
 * package), or the provider's own reason it could not be found.
 */
export function HolderCheck({
  checking,
  name,
  sub,
  error,
}: {
  checking: boolean;
  name: string | null;
  sub: string | null;
  error: string | null;
}) {
  const c = useThemeColors();
  if (checking) {
    return (
      <View style={{ marginTop: 10, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.chip }}>
        <ActivityIndicator size="small" color={c.faint} />
        <Text style={{ color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Checking this account…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ marginTop: 10, marginHorizontal: 20, flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.failSoft }}>
        <AlertTriangle color={c.fail} size={18} />
        <Text style={{ flex: 1, color: c.fail, fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 }}>{error}</Text>
      </View>
    );
  }
  if (!name) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Account holder ${name}${sub ? `, ${sub}` : ''}`}
      style={{ marginTop: 10, marginHorizontal: 20, flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.brandSoft }}
    >
      <ShieldCheck color={c.brandText} size={18} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.brandText, fontSize: 14, fontFamily: 'Inter_700Bold' }}>{name}</Text>
        {sub ? <Text style={{ marginTop: 2, color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** Cable packages: a card of rows with a radio ring (purple, 6 pt when chosen), name and price. */
export function PackageList<T extends { id?: string; variation_code: string; name: string; price: number }>({
  packages,
  selectedCode,
  onSelect,
  loading,
}: {
  packages: T[];
  selectedCode: string | null;
  onSelect: (p: T) => void;
  loading: boolean;
}) {
  const c = useThemeColors();
  return (
    <View>
      <FieldLabel>Package</FieldLabel>
      <View
        style={{
          marginTop: 8,
          marginHorizontal: 20,
          backgroundColor: c.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: c.cardLine,
          boxShadow: c.shadow,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={c.muted} />
          </View>
        ) : packages.length === 0 ? (
          <Text style={{ paddingVertical: 20, paddingHorizontal: 16, textAlign: 'center', color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
            Packages for this provider are unavailable right now. Try again shortly.
          </Text>
        ) : (
          packages.map((p, i) => {
            const on = p.variation_code === selectedCode;
            return (
              <Tap
                key={`${p.variation_code}-${i}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}, ${naira0(p.price)}`}
                onPress={() => onSelect(p)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: c.line,
                  backgroundColor: pressed ? c.chip : 'transparent',
                })}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? PURPLE : c.line }} />
                <Text style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>{p.name}</Text>
                <Text style={{ color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>{naira0(p.price)}</Text>
              </Tap>
            );
          })
        )}
      </View>
    </View>
  );
}
