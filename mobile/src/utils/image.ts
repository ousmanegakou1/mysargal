// ============================================================
// MySargal Caisse - Selection et compression d'images
// Reproduit le redimensionnement de l'app web (largeur max 1080, JPEG 0.82)
// avant envoi vers push-image ou le stockage du logo.
// ============================================================

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export interface PickedImage {
  uri: string;
  base64DataUrl: string; // data:image/jpeg;base64,...
  base64: string; // sans prefixe
  width: number;
  height: number;
}

// Ouvre la galerie, redimensionne et renvoie l'image en base64. null si annule.
export async function pickImage(maxWidth = 1080): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Acces aux photos refuse.');

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  });
  if (res.canceled || !res.assets || !res.assets.length) return null;
  const asset = res.assets[0];

  const needResize = (asset.width || 0) > maxWidth;
  const manip = await ImageManipulator.manipulateAsync(
    asset.uri,
    needResize ? [{ resize: { width: maxWidth } }] : [],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  const base64 = manip.base64 || (await FileSystem.readAsStringAsync(manip.uri, { encoding: FileSystem.EncodingType.Base64 }));
  return {
    uri: manip.uri,
    base64,
    base64DataUrl: `data:image/jpeg;base64,${base64}`,
    width: manip.width,
    height: manip.height,
  };
}

// Prepare un binaire pour l'upload Storage (logo). Renvoie l'octet + type.
export async function readAsBytes(uri: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const bytes = await blob.arrayBuffer();
  return { bytes, contentType: blob.type || 'image/jpeg' };
}
