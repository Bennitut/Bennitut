import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export class CameraDeniedError extends Error {}

/** Verkleinert ein Foto, damit es als data-URI im Rezept (und beim Teilen) klein bleibt. */
async function compressPhoto(uri: string): Promise<string | null> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: 800 }).renderAsync();
  const saved = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
}

/** Foto aufnehmen oder auswählen (16:9 zugeschnitten) und als kleine data-URI liefern; null bei Abbruch. */
export async function pickRecipePhoto(source: "camera" | "library"): Promise<string | null> {
  if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new CameraDeniedError();
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: "images", allowsEditing: true, aspect: [16, 9], quality: 1 };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? compressPhoto(asset.uri) : null;
}
