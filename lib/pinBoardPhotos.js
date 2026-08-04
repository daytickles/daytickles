// lib/pinBoardPhotos.js
//
// Local-only photo capture/storage for the Pin Board. expo-image-picker
// hands back a copy in a temp/cache location that isn't guaranteed to
// stick around, so every picked asset is immediately copied into the
// app's own private storage (Paths.document/pinboard) — that copy, not
// the picker's original, is what pinned_photos.file_path ends up
// pointing at.

import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

const PINBOARD_DIR = new Directory(Paths.document, 'pinboard');

function ensurePinBoardDir() {
  if (!PINBOARD_DIR.exists) PINBOARD_DIR.create({ intermediates: true, idempotent: true });
}

function saveAssetToPinBoard(asset) {
  ensurePinBoardDir();
  const extensionMatch = asset.uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : 'jpg';
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const destFile = new File(PINBOARD_DIR, filename);
  new File(asset.uri).copy(destFile);
  return destFile.uri;
}

export async function pickFromCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return { canceled: true };

  try {
    return { canceled: false, uri: saveAssetToPinBoard(result.assets[0]) };
  } catch (err) {
    console.error('pickFromCamera: failed to save captured photo', err);
    return { canceled: true, error: 'Could not save that photo — please try again.' };
  }
}

export async function pickFromLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return { canceled: true };

  try {
    return { canceled: false, uri: saveAssetToPinBoard(result.assets[0]) };
  } catch (err) {
    console.error('pickFromLibrary: failed to save picked photo', err);
    return { canceled: true, error: 'Could not save that photo — please try again.' };
  }
}

export function deletePinBoardPhotoFile(uri) {
  const file = new File(uri);
  if (file.exists) file.delete();
}
