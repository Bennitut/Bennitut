import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { AccountManage } from "../components/AccountManage";
import { ComingSoonNote } from "../components/ComingSoon";
import { legalDraftState } from "../components/Legal";
import { StorageWarning } from "../components/StorageWarning";
import { Badge, Button, Card, Chip, ChipRow, Field, Muted, NutrientRow, Screen, ShowMore, colors, styles } from "../components/ui";
import type { TKey } from "../i18n";
import { providerName } from "../lib/account";
import { hasAiConsent } from "../lib/aiConsent";
import { api, HAS_SERVER } from "../lib/api";
import { formatDate, formatDay } from "../lib/dates";
import { HISTORY_RANGES, backupFileName, diaryCsv, diaryJson, historySummary, type HistoryRange } from "../lib/history";
import { offerFile, pickBackupFile } from "../lib/historyFiles";
import { useI18n } from "../lib/i18n";
import { serverLine, type ServerHealth } from "../lib/serverStatus";
import { today } from "../lib/pantry";
import { useStore } from "../lib/store";

const RANGE_LABELS: Record<HistoryRange, TKey> = { 7: "profile.days7", 30: "profile.days30", 365: "history.days365", all: "history.daysAll" };
const BAR_LEGEND: Record<"day" | "week" | "month", TKey> = { day: "history.barsDay", week: "history.barsWeek", month: "history.barsMonth" };
/** Tage pro Seite in der Liste der vergangenen Tage. */
const DAYS_PAGE = 30;

export default function ProfileScreen() {
  const { settings, updateSettings, diary, diaryState, importDiary, diarySync, refreshDiary, auth, setAuth, isAdmin, deviceClaim, aiConsent, setAiConsent } =
    useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [range, setRange] = useState<HistoryRange>(7);
  const [shownDays, setShownDays] = useState(DAYS_PAGE);
  const [backupMessage, setBackupMessage] = useState<{ text: string; error: boolean } | null>(null);
  /** Bestätigung nach „Konto löschen“ (dann ist man abgemeldet). */
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  /** Bestätigung nach „Erlaubnis widerrufen“ (KI-Funktionen). */
  const [aiRevoked, setAiRevoked] = useState(false);
  // Beim Öffnen auch Einträge anderer Geräte holen (mit Konto).
  useFocusEffect(
    useCallback(() => {
      if (HAS_SERVER) refreshDiary();
    }, [refreshDiary]),
  );
  // undefined = wird geprüft, null = keine Antwort. Bei jedem Öffnen neu, z. B. nachdem Ollama gestartet wurde.
  const [health, setHealth] = useState<ServerHealth | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (!HAS_SERVER) return;
      let active = true;
      api
        .health()
        .then((h) => active && setHealth(h))
        .catch(() => active && setHealth(null));
      return () => {
        active = false;
      };
    }, []),
  );
  const server = serverLine(health);
  const target = settings.kcalPerPersonPerDay;
  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : t("profile.none"));

  const history = useMemo(() => historySummary(diary, range, today()), [diary, range]);
  const maxKcal = Math.max(target * 1.3, ...history.bars.map((b) => b.kcal));
  const thisYear = today().slice(0, 4);

  const syncText = (() => {
    switch (diarySync.state) {
      case "off":
        return t("history.syncLocal");
      case "synced": {
        const at = diarySync.at ? new Date(diarySync.at) : null;
        const time = at ? at.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : "";
        const sameDay = at && at.toDateString() === new Date().toDateString();
        return t("history.syncDone", { time: at && !sameDay ? `${at.toLocaleDateString(i18n.language)} ${time}` : time });
      }
      case "syncing":
        return t("history.syncRunning");
      case "offline":
        return t("history.syncOffline");
      default:
        return t("history.syncWaiting");
    }
  })();

  const exportHistory = async (kind: "csv" | "json") => {
    setBackupMessage(null);
    const name = backupFileName(today(), kind);
    const text =
      kind === "json"
        ? diaryJson(diaryState)
        : diaryCsv(
            diary,
            {
              date: t("history.csvDate"),
              time: t("history.csvTime"),
              title: t("history.csvTitle"),
              kcal: t("history.csvKcal"),
              protein: t("history.csvProtein"),
              carbs: t("history.csvCarbs"),
              fat: t("history.csvFat"),
              source: t("history.csvSource"),
              sources: { foto: t("history.sourceFoto"), plan: t("history.sourcePlan"), manuell: t("history.sourceManuell") },
            },
            // Deutsch, Französisch, Italienisch und Spanisch schreiben 1,5 – Excel trennt dort Spalten mit „;“.
            i18n.language !== "en",
          );
    try {
      if ((await offerFile(name, text, kind, t("profile.history"))) === "downloaded") {
        setBackupMessage({ text: t("history.exportDone", { name }), error: false });
      }
    } catch {
      setBackupMessage({ text: t("history.exportFailed"), error: true });
    }
  };

  const importHistory = async () => {
    setBackupMessage(null);
    let text: string | null;
    try {
      text = await pickBackupFile();
    } catch {
      setBackupMessage({ text: t("history.importFailed"), error: true });
      return;
    }
    if (text === null) return;
    const result = importDiary(text);
    setBackupMessage(
      result.ok
        ? { text: t("history.imported", { added: result.added, updated: result.updated, unchanged: result.unchanged }), error: false }
        : { text: t(result.error === "not_json" ? "history.importNotJson" : "history.importNotBackup"), error: true },
    );
  };

  return (
    <Screen>
      <StorageWarning />
      <Card title={t("account.title")} icon="🔐">
        {auth ? (
          <>
            <View style={styles.row}>
              <Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>{t("account.signedInAs", { name: auth.user.name })}</Text>
              <Badge
                label={auth.user.role === "admin" ? t("account.roleAdmin") : t("account.roleUser")}
                color={auth.user.role === "admin" ? colors.warning : colors.primary}
                tint={auth.user.role === "admin" ? colors.accentTint : colors.selected}
              />
            </View>
            <Muted>
              {auth.user.email ?? ""} {t("account.via", { provider: providerName(auth.user.provider, t("account.providerEmail")) })}
            </Muted>
            {deviceClaim ? <Text style={styles.text}>{t("account.deviceClaimed")}</Text> : null}
            <Button label={t("account.directory")} variant="secondary" onPress={() => router.push("/users")} />
            {isAdmin ? <Button label={t("account.adminArea")} onPress={() => router.push("/admin")} /> : null}
            <Button
              label={t("account.signOut")}
              variant="secondary"
              onPress={() => {
                api.logout().catch(() => {});
                setAuth(null);
              }}
            />
          </>
        ) : HAS_SERVER ? (
          <>
            {accountNotice ? <Text style={styles.text}>{accountNotice}</Text> : null}
            <Muted>{t("account.notSignedIn")}</Muted>
            <Button label={t("account.signInOrRegister")} onPress={() => router.push("/login")} />
          </>
        ) : (
          // Ohne Server keine Anmeldung: Hinweis statt eines Knopfs, der zu „Ohne Verbindung … keine Anmeldung“ führt.
          <ComingSoonNote text={t("account.signInSoon")} />
        )}
        {HAS_SERVER ? <Muted>{t(server.key, { model: server.model })}</Muted> : null}
      </Card>
      {auth ? <AccountManage auth={auth} onDeleted={() => setAccountNotice(t("account.deleted"))} /> : null}

      <Card title={t("profile.you")} icon="🙋">
        <Field label={t("settings.displayName")} hint={t("settings.displayNameHint")}>
          <TextInput
            style={styles.input}
            defaultValue={settings.displayName}
            accessibilityLabel={t("settings.displayName")}
            maxLength={40}
            onChangeText={(text) => updateSettings({ displayName: text.trim() })}
          />
        </Field>
        <Text style={styles.text}>
          {t(`goals.${settings.goal}`)} · {t("profile.kcal", { kcal: target })}
        </Text>
        {settings.body ? (
          <Muted>
            {t(`sex.${settings.body.sex}`)} ·{" "}
            {t("profile.body", { age: settings.body.age, height: settings.body.heightCm, weight: settings.body.weightKg })} ·{" "}
            {t(`activity.${settings.body.activity}`)}
          </Muted>
        ) : null}
      </Card>

      <Card title={t("profile.habits")} icon="🥗">
        <Text style={styles.text}>
          {[t(`diets.${settings.diet}`), ...settings.rules.map((r) => t(`rules.${r}`))].join(" · ")}
        </Text>
        <Muted>{t("profile.allergiesLabel", { list: list(settings.allergens.map((a) => t(`allergens.${a}`))) })}</Muted>
        <Muted>{t("profile.dislikesLabel", { list: list(settings.excludeIngredients.map((id) => i18n.ingredientName(id))) })}</Muted>
        <Muted>{t("profile.cuisinesLabel", { list: list(settings.cuisines.map((c) => t(`cuisines.${c}`))) })}</Muted>
        <Muted>
          👥 {settings.people} · {settings.mealTypes.map((m) => i18n.mealType(m)).join(", ")} · ⏱{" "}
          {settings.maxCookMinutes === 0 ? t("settings.noLimit") : t("common.minutes", { n: settings.maxCookMinutes })}
        </Muted>
        <Muted>
          {t("onboarding.budgetTitle")}: {t(`budget.${settings.budget}`)} · {t(`variety.${settings.variety}`)}
        </Muted>
        <Button label={t("profile.editHabits")} onPress={() => router.push("/onboarding")} />
      </Card>

      <Card title={t("profile.history")} icon="📈" tint={colors.accentTint}>
        <ChipRow>
          {HISTORY_RANGES.map((r) => (
            <Chip
              key={r}
              label={t(RANGE_LABELS[r])}
              selected={range === r}
              onPress={() => {
                setRange(r);
                setShownDays(DAYS_PAGE);
              }}
            />
          ))}
        </ChipRow>
        {history.days.length === 0 ? (
          <Muted>{t("profile.noHistory")}</Muted>
        ) : (
          <>
            <Text style={styles.text}>{t("profile.avgKcal", { kcal: Math.round(history.avg.kcal), target })}</Text>
            <Muted>
              {t("profile.avgMacros", {
                protein: Math.round(history.avg.protein),
                carbs: Math.round(history.avg.carbs),
                fat: Math.round(history.avg.fat),
              })}
            </Muted>
            <Muted>{t("profile.daysLogged", { n: history.days.length, total: history.totalDays })}</Muted>
            {/* Balken pro Tag, Woche oder Monat (Ø pro erfasstem Tag), älteste links; die Linie markiert das Kalorienziel. */}
            <View
              style={{ height: 90, flexDirection: "row", alignItems: "flex-end", gap: history.bars.length <= 7 ? 6 : history.bars.length <= 31 ? 2 : 1, marginTop: 8 }}
            >
              <View
                style={{ position: "absolute", left: 0, right: 0, bottom: (target / maxKcal) * 90, height: 1, backgroundColor: colors.muted }}
              />
              {history.bars.map((bar) => (
                <View
                  key={bar.start}
                  style={{
                    flex: 1,
                    height: Math.max(2, (bar.kcal / maxKcal) * 90),
                    borderRadius: history.bars.length > 60 ? 1 : 3,
                    backgroundColor: bar.kcal > target * 1.1 ? "#d98b3a" : bar.logged > 0 ? colors.primary : colors.border,
                  }}
                />
              ))}
            </View>
            <View style={styles.row}>
              <Muted>{formatDate(history.from, i18n.language)}</Muted>
              <Muted>{formatDate(history.to, i18n.language)}</Muted>
            </View>
            <Muted>{t(BAR_LEGEND[history.unit])}</Muted>
            {history.top.length > 0 ? (
              <Field label={t("profile.topMeals")}>
                {history.top.map(([title, n]) => (
                  <Muted key={title}>
                    {n}× {title}
                  </Muted>
                ))}
              </Field>
            ) : null}
            {/* Alle erfassten Tage, neueste zuerst, zum Blättern in Seiten zu 30 Tagen. */}
            {history.days.slice(0, shownDays).map((d) => (
              <View key={d.date} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
                <View style={styles.row}>
                  <Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>{formatDay(d.date, i18n.language, d.date.slice(0, 4) !== thisYear)}</Text>
                  <Muted>
                    {Math.round(d.total.kcal)} kcal · {t("profile.entries", { n: d.entries.length })}
                  </Muted>
                </View>
                <Muted>{d.entries.map((e) => e.title).join(", ")}</Muted>
                <NutrientRow nutrients={d.total} />
              </View>
            ))}
            <ShowMore shown={Math.min(shownDays, history.days.length)} total={history.days.length} onPress={() => setShownDays((n) => n + DAYS_PAGE)} />
          </>
        )}
      </Card>

      <Card title={t("history.backupTitle")} icon="💾">
        <Text style={styles.text}>{syncText}</Text>
        {HAS_SERVER ? <Muted>{t(auth ? "history.syncSignedIn" : "history.syncAccount")}</Muted> : null}
        <Button label={t("history.exportCsv")} variant="secondary" onPress={() => exportHistory("csv")} />
        <Button label={t("history.exportJson")} variant="secondary" onPress={() => exportHistory("json")} />
        <Button label={t("history.importJson")} variant="secondary" onPress={importHistory} />
        <Muted>{t("history.exportHint")}</Muted>
        {backupMessage ? <Text style={backupMessage.error ? styles.error : styles.text}>{backupMessage.text}</Text> : null}
      </Card>

      {/* Einwilligung in die KI-Funktionen (lib/aiConsent.ts): ansehen und widerrufen. Ohne Server gibt es keine KI. */}
      {HAS_SERVER ? (
        <Card title={t("aiConsent.profileTitle")} icon="🤖">
          {hasAiConsent(aiConsent) ? (
            <>
              <Text style={styles.text}>{t("aiConsent.profileGranted", { date: formatDate(today(new Date(aiConsent.at)), i18n.language) })}</Text>
              <Muted>{t("aiConsent.profileGrantedHint")}</Muted>
              <Button
                label={t("aiConsent.revoke")}
                variant="secondary"
                onPress={() => {
                  setAiConsent(null);
                  setAiRevoked(true);
                }}
              />
            </>
          ) : (
            <Muted>{t(aiRevoked ? "aiConsent.revoked" : "aiConsent.profileNotYet")}</Muted>
          )}
        </Card>
      ) : null}

      <Button label={`🌐 ${t("profile.settings")} ›`} variant="secondary" onPress={() => router.push("/settings")} />
      <Button
        label={`§ ${t("legal.title")}${legalDraftState().draft ? ` · ${t("legal.draftBadge")}` : ""} ›`}
        variant="secondary"
        onPress={() => router.push("/legal")}
      />
    </Screen>
  );
}
