import { useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { newId } from "../lib/pantry";
import { CameraDeniedError, pickRecipePhoto } from "../lib/photos";
import { useStore } from "../lib/store";
import { FLAG_REASONS, type FlagReason, type ImprovedRecipe, type Recipe, type RecipePhoto } from "../lib/types";
import { Badge, Button, Card, Chip, ChipRow, ErrorText, Muted, colors, styles } from "./ui";

/** Fünf Sterne; mit onChange antippbar. */
export function StarRating({ value, onChange, size = 24 }: { value: number; onChange?: (stars: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} ★`}>
          <Text style={{ fontSize: size, color: n <= Math.round(value) ? "#F5A623" : colors.border }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function RatingCard({ recipe }: { recipe: Recipe }) {
  const { ratings, setRating } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [error, setError] = useState<string | null>(null);
  const rating = ratings[recipe.id];

  const rate = async (stars: number) => {
    setError(null);
    try {
      setRating(recipe.id, await api.rateRecipe(recipe.id, stars));
    } catch (e) {
      setError(i18n.error(e));
    }
  };

  return (
    <Card title={t("feedback.rating")} icon="⭐" tint="#FFF4D6">
      <View style={styles.row}>
        <StarRating value={rating?.avg ?? 0} size={22} />
        <Muted>{rating?.count ? t("feedback.avg", { avg: i18n.number(rating.avg), n: rating.count }) : t("feedback.noRatings")}</Muted>
      </View>
      <Muted>{t("feedback.rateHint")}</Muted>
      <StarRating value={rating?.mine ?? 0} onChange={rate} size={34} />
      <ErrorText message={error} />
    </Card>
  );
}

interface GalleryItem {
  key: string;
  uri: string;
  label: string;
  avg: number;
  count: number;
  myRating: number | null;
  /** Öffentliches Foto zum Bewerten (nicht das eigene). */
  rateId: string | null;
  own: { localId: string; public: boolean; remoteId: string | null } | null;
}

export function PhotoGallery({ recipe }: { recipe: Recipe }) {
  const { myPhotos, addMyPhoto, updateMyPhoto, removeMyPhoto, settings } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [remote, setRemote] = useState<RecipePhoto[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [makePublic, setMakePublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.photos(recipe.id).then(setRemote).catch(() => setRemote([]));
  }, [recipe.id]);

  const mine = myPhotos.filter((p) => p.recipeId === recipe.id);
  const ownRemoteIds = new Set(mine.map((p) => p.remoteId).filter(Boolean));
  const items: GalleryItem[] = [
    ...mine.map((p) => {
      const r = remote.find((x) => x.id === p.remoteId);
      return {
        key: p.id,
        uri: p.uri,
        label: t("feedback.you"),
        avg: r?.avg ?? 0,
        count: r?.count ?? 0,
        myRating: null,
        rateId: null,
        own: { localId: p.id, public: p.public, remoteId: p.remoteId },
      };
    }),
    ...remote
      .filter((p) => !ownRemoteIds.has(p.id))
      .map((p) => ({
        key: p.id,
        uri: p.uri,
        label: p.mine ? t("feedback.you") : t("feedback.by", { name: p.authorName || t("feedback.anonymous") }),
        avg: p.avg,
        count: p.count,
        myRating: p.myRating,
        rateId: p.mine ? null : p.id,
        own: null,
      })),
  ];

  const pick = async (source: "camera" | "library") => {
    setError(null);
    try {
      const uri = await pickRecipePhoto(source);
      if (uri) setDraft(uri);
    } catch (e) {
      setError(e instanceof CameraDeniedError ? t("scan.cameraDenied") : i18n.error(e));
    }
  };

  const publish = async (uri: string) => {
    const photo = await api.addPhoto(recipe.id, settings.displayName.trim(), uri);
    setRemote((list) => [...list, photo]);
    return photo.id;
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const id = newId();
    let remoteId: string | null = null;
    if (makePublic) {
      try {
        remoteId = await publish(draft);
      } catch {
        setError(t("feedback.offline"));
      }
    }
    addMyPhoto({ id, recipeId: recipe.id, uri: draft, public: remoteId !== null, remoteId, createdAt: new Date().toISOString() });
    setDraft(null);
    setBusy(false);
  };

  const ratePhoto = async (photoId: string, stars: number) => {
    try {
      const updated = await api.ratePhoto(photoId, stars);
      setRemote((list) => list.map((p) => (p.id === photoId ? updated : p)));
    } catch (e) {
      setError(i18n.error(e));
    }
  };

  const remove = (item: GalleryItem) =>
    Alert.alert(t("feedback.deletePhoto"), "", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          if (item.own?.remoteId) api.deletePhoto(item.own.remoteId).catch(() => {});
          setRemote((list) => list.filter((p) => p.id !== item.own?.remoteId));
          if (item.own) removeMyPhoto(item.own.localId);
        },
      },
    ]);

  const share = async (item: GalleryItem) => {
    if (!item.own) return;
    try {
      const remoteId = await publish(item.uri);
      updateMyPhoto(item.own.localId, { public: true, remoteId });
    } catch (e) {
      setError(i18n.error(e));
    }
  };

  return (
    <Card title={t("feedback.gallery")} icon="🖼️" tint="#ECEBF8">
      {items.length === 0 ? (
        <Muted>{t("feedback.galleryEmpty")}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {items.map((item) => (
            <View key={item.key} style={{ width: 200, gap: 4 }}>
              <Image source={{ uri: item.uri }} style={{ width: 200, height: 112, borderRadius: 12 }} />
              <View style={styles.row}>
                <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.own ? <Badge label={item.own.public ? t("feedback.public") : t("feedback.private")} /> : null}
              </View>
              {item.rateId ? (
                <StarRating value={item.myRating ?? 0} onChange={(stars) => ratePhoto(item.rateId!, stars)} size={20} />
              ) : item.count > 0 ? (
                <Muted>{t("feedback.avg", { avg: i18n.number(item.avg), n: item.count })}</Muted>
              ) : null}
              {item.own ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {!item.own.public ? <Chip label={t("feedback.makePublic")} onPress={() => share(item)} /> : null}
                  <Chip label={t("feedback.deletePhoto")} onPress={() => remove(item)} />
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.label}>{t("feedback.addPhoto")}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={t("feedback.takePhoto")} variant="secondary" onPress={() => pick("camera")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t("feedback.fromGallery")} variant="secondary" onPress={() => pick("library")} />
        </View>
      </View>
      <ErrorText message={error} />

      <Modal visible={draft !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
          {draft ? <Image source={{ uri: draft }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16 }} /> : null}
          <Card title={t("feedback.visibility")} icon="👀">
            <ChipRow>
              <Chip label={t("feedback.public")} selected={makePublic} onPress={() => setMakePublic(true)} />
              <Chip label={t("feedback.private")} selected={!makePublic} onPress={() => setMakePublic(false)} />
            </ChipRow>
            <Muted>{t("feedback.publicHint")}</Muted>
          </Card>
          <Button label={t("feedback.save")} onPress={save} loading={busy} />
          <Button label={t("common.cancel")} variant="secondary" onPress={() => setDraft(null)} />
        </ScrollView>
      </Modal>
    </Card>
  );
}

const REASON_KEYS: Record<FlagReason, "feedback.reasonText" | "feedback.reasonAmounts" | "feedback.reasonImage" | "feedback.reasonOther"> = {
  text: "feedback.reasonText",
  amounts: "feedback.reasonAmounts",
  image: "feedback.reasonImage",
  other: "feedback.reasonOther",
};

/** Problem melden (für spätere Verbesserung) und Text mit KI an Zutaten und Mengen anpassen. */
export function ImproveCard({ recipe }: { recipe: Recipe }) {
  const { ingredients, flaggedIds, markFlagged, textOverrides, setTextOverride } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason>("text");
  const [note, setNote] = useState("");
  const [proposal, setProposal] = useState<ImprovedRecipe | null>(null);
  const [busy, setBusy] = useState<"report" | "improve" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flagged = flaggedIds.includes(recipe.id);
  const hasOverride = Boolean(textOverrides[recipe.id]?.[i18n.language]);

  const sendReport = async () => {
    setBusy("report");
    setError(null);
    try {
      await api.flagRecipe(recipe.id, reason, note.trim());
      markFlagged(recipe.id);
      setReportOpen(false);
      setMessage(t("feedback.reported"));
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setBusy(null);
    }
  };

  const improve = async () => {
    setBusy("improve");
    setError(null);
    try {
      const text = i18n.recipe(recipe);
      setProposal(
        await api.improveRecipe({
          text,
          ingredients: recipe.ingredients.map((ri) => {
            const ingredient = ingredients.get(ri.ingredientId);
            return { name: i18n.ingredientName(ri.ingredientId), amount: ingredient ? i18n.amount(ri.amount, ingredient.unit) : String(ri.amount) };
          }),
          cookMinutes: recipe.cookMinutes,
          problem: note.trim(),
          language: i18n.language,
        }),
      );
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!proposal) return;
    setTextOverride(recipe.id, i18n.language, { name: proposal.name, steps: proposal.steps, otherIngredients: proposal.otherIngredients });
    // Auch gemeldet, damit das Rezept im Katalog dauerhaft verbessert werden kann.
    api.flagRecipe(recipe.id, "text", `${t("feedback.improvedNote")}: ${proposal.changes.join("; ")}`.slice(0, 500)).catch(() => {});
    markFlagged(recipe.id);
    setProposal(null);
    setMessage(t("feedback.improved"));
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {hasOverride ? <Badge label={t("feedback.improved")} /> : null}
        {flagged ? <Badge label={t("feedback.flagged")} color={colors.warning} tint={colors.accentTint} /> : null}
      </View>
      <Button label={t("feedback.improve")} variant="secondary" onPress={improve} loading={busy === "improve"} />
      {busy === "improve" ? <Muted>{t("feedback.improving")}</Muted> : null}
      <Button label={t("feedback.report")} variant="secondary" onPress={() => setReportOpen(true)} />
      {hasOverride ? <Button label={t("feedback.restore")} variant="secondary" onPress={() => setTextOverride(recipe.id, i18n.language, null)} /> : null}
      {message ? <Muted>{message}</Muted> : null}
      <ErrorText message={error} />

      <Modal visible={reportOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReportOpen(false)}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
          <Card title={t("feedback.reportTitle")} icon="⚠️" tint={colors.accentTint}>
            <ChipRow>
              {FLAG_REASONS.map((r) => (
                <Chip key={r} label={t(REASON_KEYS[r])} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </ChipRow>
            <TextInput
              style={[styles.input, { minHeight: 90 }]}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              placeholder={t("feedback.notePlaceholder")}
              accessibilityLabel={t("feedback.notePlaceholder")}
            />
            <Button label={t("feedback.send")} onPress={sendReport} loading={busy === "report"} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setReportOpen(false)} />
            <ErrorText message={error} />
          </Card>
        </ScrollView>
      </Modal>

      <Modal visible={proposal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProposal(null)}>
        <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
          {proposal ? (
            <>
              <Card title={t("feedback.improveTitle")} icon="✨">
                <Text style={styles.cardTitle}>{proposal.name}</Text>
                {proposal.steps.map((step, i) => (
                  <Text key={i} style={styles.text}>
                    {i + 1}. {step}
                  </Text>
                ))}
                {proposal.otherIngredients.length > 0 ? <Muted>{proposal.otherIngredients.join(" · ")}</Muted> : null}
              </Card>
              {proposal.changes.length > 0 ? (
                <Card title={t("feedback.changes")} icon="📝">
                  {proposal.changes.map((c, i) => (
                    <Muted key={i}>• {c}</Muted>
                  ))}
                </Card>
              ) : null}
              {proposal.remainingIssues.length > 0 ? (
                <Card title={t("feedback.remaining")} icon="⚠️" tint={colors.accentTint}>
                  {proposal.remainingIssues.map((c, i) => (
                    <Muted key={i}>• {c}</Muted>
                  ))}
                </Card>
              ) : null}
              <Button label={t("feedback.apply")} onPress={apply} />
              <Button label={t("feedback.discard")} variant="secondary" onPress={() => setProposal(null)} />
            </>
          ) : null}
        </ScrollView>
      </Modal>
    </Card>
  );
}
