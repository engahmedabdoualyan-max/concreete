/**
 * Competitor Analysis Screen (المصانع المنافسة)
 * R&D records rival plants, their mixes & prices vs ours,
 * and compares grade-by-grade to position pricing.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { Competitor, CompetitorProduct, PriceComparison, PriceVerdict } from "@/types/rnd";

const VERDICT_STYLE: Record<PriceVerdict, { bg: string; text: string; emoji: string }> = {
  CHEAPER: { bg: "bg-emerald-100", text: "text-emerald-700", emoji: "✅" },
  EQUAL: { bg: "bg-sky-100", text: "text-sky-700", emoji: "🤝" },
  PRICIER: { bg: "bg-red-100", text: "text-red-700", emoji: "🔴" },
  UNKNOWN: { bg: "bg-slate-100", text: "text-slate-500", emoji: "❓" },
};

export default function CompetitorAnalysisScreen() {
  const { t } = useT();

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<CompetitorProduct[]>([]);
  const [comparison, setComparison] = useState<PriceComparison | null>(null);
  const [loading, setLoading] = useState(false);

  // Add competitor form
  const [showCompForm, setShowCompForm] = useState(false);
  const [compName, setCompName] = useState("");
  const [compCity, setCompCity] = useState("");
  const [compPhone, setCompPhone] = useState("");
  const [compNotes, setCompNotes] = useState("");
  const [savingComp, setSavingComp] = useState(false);

  // Add product form
  const [showProdForm, setShowProdForm] = useState(false);
  const [grade, setGrade] = useState("");
  const [theirPrice, setTheirPrice] = useState("");
  const [ourPrice, setOurPrice] = useState("");
  const [extras, setExtras] = useState("");
  const [savingProd, setSavingProd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [comps, comp] = await Promise.all([
        rndApi.getCompetitors(),
        rndApi.getPriceComparison(),
      ]);
      setCompetitors(comps);
      setComparison(comp);
      if (!selectedId && comps.length > 0) {
        setSelectedId(comps[0].id);
        setProducts(await rndApi.getCompetitorProducts(comps[0].id));
      } else if (selectedId) {
        setProducts(await rndApi.getCompetitorProducts(selectedId));
      }
    } catch {
      // Offline — keep cached view
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCompetitor = async (id: string) => {
    setSelectedId(id);
    setLoading(true);
    try {
      setProducts(await rndApi.getCompetitorProducts(id));
    } finally {
      setLoading(false);
    }
  };

  const addCompetitor = async () => {
    if (!compName.trim()) {
      Alert.alert(t("common.error"), t("rnd.comp.name"));
      return;
    }
    setSavingComp(true);
    try {
      const created = await rndApi.createCompetitor({
        name: compName.trim(),
        city: compCity.trim() || undefined,
        phone: compPhone.trim() || undefined,
        notes: compNotes.trim() || undefined,
      });
      setCompetitors([created, ...competitors]);
      setSelectedId(created.id);
      setProducts([]);
      setCompName("");
      setCompCity("");
      setCompPhone("");
      setCompNotes("");
      setShowCompForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSavingComp(false);
    }
  };

  const removeCompetitor = (id: string) => {
    Alert.alert(t("rnd.comp.delete"), t("rnd.comp.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("rnd.common.reject"),
        style: "destructive",
        onPress: async () => {
          try {
            await rndApi.deleteCompetitor(id);
            const next = competitors.filter((c) => c.id !== id);
            setCompetitors(next);
            if (selectedId === id) {
              setSelectedId(next[0]?.id ?? null);
              setProducts(next[0] ? await rndApi.getCompetitorProducts(next[0].id) : []);
            }
            setComparison(await rndApi.getPriceComparison());
          } catch {
            Alert.alert(t("common.error"), t("rnd.common.loading"));
          }
        },
      },
    ]);
  };

  const addProduct = async () => {
    if (!selectedId || !grade.trim()) {
      Alert.alert(t("common.error"), t("rnd.comp.grade"));
      return;
    }
    setSavingProd(true);
    try {
      const created = await rndApi.createCompetitorProduct(selectedId, {
        grade: grade.trim().toUpperCase(),
        theirPriceSar: parseFloat(theirPrice) || 0,
        ourPriceSar: parseFloat(ourPrice) || 0,
        extrasNote: extras.trim() || undefined,
      });
      setProducts([created, ...products]);
      setComparison(await rndApi.getPriceComparison());
      setGrade("");
      setTheirPrice("");
      setOurPrice("");
      setExtras("");
      setShowProdForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSavingProd(false);
    }
  };

  const summary = comparison?.summary;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text className="text-lg font-bold text-slate-800 mb-2">
        🏭 {t("rnd.competitors")}
      </Text>

      {/* Comparison summary */}
      {summary ? (
        <View className="flex-row gap-2 mb-3">
          <Card variant="default" className="flex-1 bg-emerald-500">
            <Text className="text-2xl font-bold text-white text-center">{summary.cheaper}</Text>
            <Text className="text-emerald-100 text-[10px] text-center">✅</Text>
          </Card>
          <Card variant="default" className="flex-1 bg-red-500">
            <Text className="text-2xl font-bold text-white text-center">{summary.pricier}</Text>
            <Text className="text-red-100 text-[10px] text-center">🔴</Text>
          </Card>
          <Card variant="default" className="flex-1 bg-sky-500">
            <Text className="text-2xl font-bold text-white text-center">{summary.equal}</Text>
            <Text className="text-sky-100 text-[10px] text-center">🤝</Text>
          </Card>
        </View>
      ) : null}

      {/* Competitors */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-bold text-slate-800">
          🏭 ({competitors.length})
        </Text>
        <TouchableOpacity onPress={() => setShowCompForm(!showCompForm)}>
          <Text className="text-sky-600 font-bold">
            {showCompForm ? t("common.cancel") : `➕ ${t("rnd.comp.add")}`}
          </Text>
        </TouchableOpacity>
      </View>

      {showCompForm ? (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.comp.name")} value={compName} onChangeText={setCompName} />
          <Input label={t("rnd.comp.city")} value={compCity} onChangeText={setCompCity} />
          <Input
            label={t("rnd.comp.phone")}
            value={compPhone}
            onChangeText={setCompPhone}
            keyboardType="phone-pad"
          />
          <Input label={t("rnd.comp.notes")} value={compNotes} onChangeText={setCompNotes} multiline />
          <Button title={t("rnd.comp.add")} onPress={addCompetitor} loading={savingComp} variant="success" />
        </Card>
      ) : null}

      {competitors.length === 0 ? (
        <Card variant="default" className="mb-3">
          <Text className="text-slate-500 text-center py-4">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        <View className="flex-row flex-wrap gap-2 mb-3">
          {competitors.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => selectCompetitor(c.id)}
              onLongPress={() => removeCompetitor(c.id)}
              className={`px-3 py-2 rounded-xl ${
                selectedId === c.id ? "bg-indigo-600" : "bg-white border border-slate-200"
              }`}
            >
              <Text className={selectedId === c.id ? "text-white font-bold" : "text-slate-700"}>
                🏭 {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Products of selected competitor */}
      {selectedId ? (
        <View>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base font-bold text-slate-800">
              🧪 {t("rnd.comp.mixes")} ({products.length})
            </Text>
            <TouchableOpacity onPress={() => setShowProdForm(!showProdForm)}>
              <Text className="text-sky-600 font-bold">
                {showProdForm ? t("common.cancel") : `➕ ${t("rnd.comp.addMix")}`}
              </Text>
            </TouchableOpacity>
          </View>

          {showProdForm ? (
            <Card variant="elevated" className="mb-3">
              <Input
                label={t("rnd.comp.grade")}
                value={grade}
                onChangeText={setGrade}
                placeholder="C30"
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label={t("rnd.comp.theirPrice")}
                    value={theirPrice}
                    onChangeText={setTheirPrice}
                    keyboardType="numeric"
                    placeholder="210"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t("rnd.comp.ourPrice")}
                    value={ourPrice}
                    onChangeText={setOurPrice}
                    keyboardType="numeric"
                    placeholder="200"
                  />
                </View>
              </View>
              <Input label={t("rnd.comp.extras")} value={extras} onChangeText={setExtras} />
              <Button title={t("rnd.comp.addMix")} onPress={addProduct} loading={savingProd} variant="success" />
            </Card>
          ) : null}

          {products.length === 0 ? (
            <Card variant="default" className="mb-3">
              <Text className="text-slate-500 text-center py-4">{t("rnd.common.noData")}</Text>
            </Card>
          ) : (
            products.map((p) => {
              const v = VERDICT_STYLE[p.verdict ?? "UNKNOWN"];
              return (
                <Card key={p.id} variant="default" className="mb-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-slate-800 font-bold text-lg">🧪 {p.grade}</Text>
                    <View className={`rounded-full px-2 py-1 ${v.bg}`}>
                      <Text className={`text-[10px] font-bold ${v.text}`}>
                        {v.emoji}{" "}
                        {p.verdict && p.verdict !== "UNKNOWN"
                          ? `${p.diffSar! > 0 ? "+" : ""}${p.diffSar} (${p.diffPct}%)`
                          : "❓"}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2 mt-2">
                    <View className="flex-1 bg-red-50 rounded-xl p-2">
                      <Text className="text-red-500 text-[10px]">{t("rnd.comp.theirPrice")}</Text>
                      <Text className="text-red-700 font-bold">{p.theirPriceSar} SAR</Text>
                    </View>
                    <View className="flex-1 bg-emerald-50 rounded-xl p-2">
                      <Text className="text-emerald-600 text-[10px]">{t("rnd.comp.ourPrice")}</Text>
                      <Text className="text-emerald-700 font-bold">
                        {p.ourPriceSar} SAR{p.ourMixCode ? ` • ${p.ourMixCode}` : ""}
                      </Text>
                    </View>
                  </View>
                  {p.extrasNote ? (
                    <Text className="text-slate-400 text-xs mt-1">📝 {p.extrasNote}</Text>
                  ) : null}
                </Card>
              );
            })
          )}
        </View>
      ) : null}

      {/* Per-grade market view */}
      {comparison && comparison.byGrade.length > 0 ? (
        <View className="mt-2">
          <Text className="text-base font-bold text-slate-800 mb-2">
            📊 {t("rnd.comp.marketView")}
          </Text>
          {comparison.byGrade.map((g) => (
            <Card key={g.grade} variant="default" className="mb-2">
              <Text className="text-slate-800 font-bold">🧪 {g.grade}</Text>
              <Text className="text-slate-500 text-xs mt-1">
                🔻 {g.lowestRivalBy}: {g.lowestRival} SAR • 🏭 {t("rnd.comp.ourPrice")}:{" "}
                {g.ourPrice} SAR
              </Text>
              {g.lowestRival > 0 && g.ourPrice > 0 ? (
                <Text
                  className={`text-xs font-bold mt-1 ${
                    g.ourPrice <= g.lowestRival ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {g.ourPrice <= g.lowestRival
                    ? `✅ ${g.lowestRival - g.ourPrice} SAR`
                    : `🔴 +${g.ourPrice - g.lowestRival} SAR`}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <View className="h-8" />
    </ScrollView>
  );
}
