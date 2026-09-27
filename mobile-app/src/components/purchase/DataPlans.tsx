import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { PressScale } from '../ds/PressScale';
import { useThemeColors, withAlpha } from '../../theme/useThemeColors';
import { brandFixed } from '../../theme/tokens';
import {
  PLAN_CATEGORY_LABELS,
  naira0,
  plansInTab,
  type PlanCategory,
  type PlanView,
} from '../../lib/purchaseForm';

const BLUE = '#3B82F6';

/**
 * The design's OPay-style plan card: tabs (Hot · Daily · Weekly · Monthly ·
 * 2–3 Months · Yearly) with a 2.5 pt blue underline on the active one, then a
 * 3-column grid — size 18/800, validity, price in brand text. A chosen plan
 * gets a blue border and tint; a popular one wears the gold badge (except on
 * the Hot tab, which is nothing but popular plans).
 */
export function DataPlans<T>({
  views,
  tabs,
  tab,
  onTab,
  selectedKey,
  keyOf,
  onSelect,
  loading,
  emptyText,
}: {
  views: PlanView<T>[];
  tabs: PlanCategory[];
  tab: PlanCategory;
  onTab: (t: PlanCategory) => void;
  selectedKey: string | null;
  keyOf: (plan: T) => string;
  onSelect: (plan: T) => void;
  loading: boolean;
  emptyText: string;
}) {
  const c = useThemeColors();
  const shown = plansInTab(views, tab);
  const rows: PlanView<T>[][] = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3));

  return (
    <View
      style={{
        marginTop: 22,
        marginHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 16,
        backgroundColor: c.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: c.cardLine,
        boxShadow: c.shadow,
      }}
    >
      <Text style={{ paddingHorizontal: 16, color: c.text, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Choose a plan</Text>

      {tabs.length > 0 ? (
        <View style={{ marginTop: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}>
            {tabs.map((t) => {
              const on = t === tab;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => onTab(t)}
                  style={{ paddingTop: 8, paddingBottom: 10, paddingHorizontal: 8, marginBottom: -1, borderBottomWidth: 2.5, borderBottomColor: on ? BLUE : 'transparent' }}
                >
                  <Text style={{ color: on ? c.text : c.muted, fontSize: 14, fontFamily: on ? 'Inter_700Bold' : 'Inter_500Medium' }}>
                    {PLAN_CATEGORY_LABELS[t]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 28, alignItems: 'center' }}>
          <ActivityIndicator color={c.muted} />
        </View>
      ) : shown.length === 0 ? (
        <Text style={{ paddingVertical: 24, paddingHorizontal: 16, textAlign: 'center', color: c.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          {emptyText}
        </Text>
      ) : (
        <View style={{ gap: 8, marginTop: 14, marginHorizontal: 12 }}>
          {rows.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
              {row.map((v) => {
                const key = keyOf(v.plan);
                const on = key === selectedKey;
                const badge = tab !== 'hot' && v.popular;
                return (
                  <PressScale
                    key={key}
                    scaleTo={0.97}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${v.size}${v.validity ? `, ${v.validity}` : ''}, ${naira0((v.plan as { price: number }).price)}${v.popular ? ', popular' : ''}`}
                    onPress={() => onSelect(v.plan)}
                    style={{
                      flex: 1,
                      paddingTop: 14,
                      paddingBottom: 12,
                      paddingHorizontal: 6,
                      borderRadius: 14,
                      alignItems: 'center',
                      gap: 3,
                      borderWidth: 1.5,
                      borderColor: on ? BLUE : c.line,
                      backgroundColor: on ? withAlpha(BLUE, 0.1) : c.card,
                    }}
                  >
                    {badge ? (
                      <View style={{ position: 'absolute', top: -8, alignSelf: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: brandFixed.gold[0] }}>
                        <Text style={{ color: brandFixed.goldText, fontSize: 9, fontFamily: 'Inter_800ExtraBold', letterSpacing: 0.36, textTransform: 'uppercase' }}>
                          Popular
                        </Text>
                      </View>
                    ) : null}
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 18, fontFamily: 'Inter_800ExtraBold', letterSpacing: -0.18 }}>
                      {v.size}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      {v.validity || ' '}
                    </Text>
                    <Text style={{ marginTop: 4, color: c.brandText, fontSize: 14, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] }}>
                      {naira0((v.plan as { price: number }).price)}
                    </Text>
                  </PressScale>
                );
              })}
              {/* Keep the last row's tiles the same width as the rows above. */}
              {Array.from({ length: 3 - row.length }, (_, i) => (
                <View key={`pad-${i}`} style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
