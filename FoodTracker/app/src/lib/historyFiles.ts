// Dateien für die Sicherung der Ernährungshistorie: speichern bzw. teilen und zum Import auswählen.
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export type FileKind = "json" | "csv";

const MIME: Record<FileKind, { mimeType: string; UTI: string }> = {
  json: { mimeType: "application/json", UTI: "public.json" },
  csv: { mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
};

/**
 * Bietet eine Datei an: im Browser als Download, in der App über „Teilen“ (Dateien, Mail, Drive …).
 * Liefert "downloaded" (Browser) bzw. "shared" (App).
 */
export async function offerFile(name: string, text: string, kind: FileKind, dialogTitle: string): Promise<"downloaded" | "shared"> {
  const { mimeType, UTI } = MIME[kind];
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "downloaded";
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error("sharing_unavailable");
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle });
  return "shared";
}

/** Lässt eine Sicherung (JSON) auswählen und liefert ihren Text; null bei Abbruch. */
export async function pickBackupFile(): Promise<string | null> {
  // Android kennt bei Dateien aus anderen Apps oft keinen JSON-Typ – dort alles anbieten, der Import prüft den Inhalt.
  const result = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === "android" ? "*/*" : ["application/json", "text/plain"],
    copyToCacheDirectory: true,
    base64: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.file) return asset.file.text();
  return new File(asset.uri).text();
}
