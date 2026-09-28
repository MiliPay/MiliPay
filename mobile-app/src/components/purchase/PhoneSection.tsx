import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Tap } from '../ds/Tap';
import { Users } from 'lucide-react-native';
import { FieldLabel, InputBox, OptionTile } from '../ds/Form';
import { useThemeColors } from '../../theme/useThemeColors';
import { telcoColors } from '../../theme/tokens';
import { formatPhone, detectTelco, type TelcoId } from '../../lib/purchaseForm';
import type { SavedNumber } from '../../lib/savedNumbers';

/** A network's round badge: its colour with the short mark ("MTN", "A", "glo", "9m"). */
export function TelcoBadge({ id, size = 32 }: { id: TelcoId; size?: number }) {
  const t = telcoColors[id];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: t.fg, fontSize: 10, fontFamily: 'Inter_800ExtraBold' }}>{t.short}</Text>
    </View>
  );
}

/**
 * Airtime and data: the recipient's number (with the detected network's
 * badge and a contacts button), the hint line under it, saved-number chips,
 * and the network picker.
 */
export function PhoneSection({
  phone,
  onPhone,
  telco,
  onTelco,
  saved,
  onPickContact,
}: {
  phone: string;
  onPhone: (digits: string) => void;
  telco: TelcoId;
  onTelco: (t: TelcoId) => void;
  saved: SavedNumber[];
  onPickContact: () => void;
}) {
  const c = useThemeColors();
  const detected = detectTelco(phone);
  const hint =
    phone.length >= 4
      ? detected
        ? `${telcoColors[detected].name} number detected`
        : 'Network not recognised, pick one below'
      : 'We detect the network from the number';

  return (
    <View>
      <FieldLabel>Phone number</FieldLabel>
      <InputBox
        value={formatPhone(phone)}
        onChangeText={(t) => onPhone(t.replace(/[^0-9]/g, '').slice(0, 11))}
        keyboardType="number-pad"
        placeholder="0803 000 0000"
        accessibilityLabel="Phone number"
        autoComplete="tel"
        inputStyle={{ letterSpacing: 0.54 }}
        left={<TelcoBadge id={telco} />}
        right={
          <Tap
            onPress={onPickContact}
            accessibilityRole="button"
            accessibilityLabel="Choose from contacts"
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: pressed ? c.line : c.chip,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Users color={c.brandText} size={18} />
          </Tap>
        }
      />
      <Text
        style={{
          marginTop: 8,
          marginHorizontal: 20,
          minHeight: 16,
          fontSize: 12,
          fontFamily: 'Inter_400Regular',
          color: detected ? c.brandText : c.muted,
        }}
      >
        {hint}
      </Text>

      {saved.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, marginTop: 6 }}>
          {saved.map((s) => (
            <Tap
              key={s.phone}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}, ${formatPhone(s.phone)}`}
              onPress={() => onPhone(s.phone)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 6,
                paddingLeft: 6,
                paddingRight: 12,
                borderRadius: 999,
                backgroundColor: pressed ? c.chip : c.card,
                borderWidth: 1,
                borderColor: c.line,
              })}
            >
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                  {s.label === 'My number' ? 'Me' : s.label.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: c.text, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{s.label}</Text>
            </Tap>
          ))}
        </ScrollView>
      ) : null}

      <FieldLabel top={20}>Network</FieldLabel>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginHorizontal: 20 }}>
        {(Object.keys(telcoColors) as TelcoId[]).map((id) => (
          <OptionTile
            key={id}
            label={telcoColors[id].name}
            selected={id === telco}
            tint={telcoColors[id].bg}
            onPress={() => onTelco(id)}
            style={{ flex: 1, height: 70, gap: 6, backgroundColor: c.card }}
          >
            <TelcoBadge id={id} size={30} />
            <Text style={{ color: c.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{telcoColors[id].name}</Text>
          </OptionTile>
        ))}
      </View>
    </View>
  );
}
