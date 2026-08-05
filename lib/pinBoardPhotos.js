// lib/pinBoardPhotos.js
//
// Local-only photo capture/storage for the Pin Board. expo-image-picker
// hands back a copy in a temp/cache location that isn't guaranteed to
// stick around, so every picked asset is immediately copied into the
// app's own private storage — that copy, not the picker's original, is
// what pinned_photos.file_path ends up pointing at.
//
// One directory per account (documentDirectory/pinboard-${userId}), not
// one shared folder — a shared folder meant one account's actual photo
// files were readable by any other account on the same device, the same
// cross-account leak as the unscoped DB fixed alongside this file.

import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Directory, File, Paths } from 'expo-file-system';

function getPinBoardDir(userId) {
  return new Directory(Paths.document, `pinboard-${userId}`);
}

function ensurePinBoardDir(userId) {
  const dir = getPinBoardDir(userId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function saveAssetToPinBoard(userId, asset) {
  const dir = ensurePinBoardDir(userId);
  const extensionMatch = asset.uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : 'jpg';
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const destFile = new File(dir, filename);
  new File(asset.uri).copy(destFile);
  return destFile.uri;
}

export async function pickFromCamera(userId) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return { canceled: true };

  try {
    return { canceled: false, uri: saveAssetToPinBoard(userId, result.assets[0]) };
  } catch (err) {
    console.error('pickFromCamera: failed to save captured photo', err);
    return { canceled: true, error: 'Could not save that photo — please try again.' };
  }
}

export async function pickFromLibrary(userId) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return { canceled: true };

  try {
    return { canceled: false, uri: saveAssetToPinBoard(userId, result.assets[0]) };
  } catch (err) {
    console.error('pickFromLibrary: failed to save picked photo', err);
    return { canceled: true, error: 'Could not save that photo — please try again.' };
  }
}

// userId-scoped as a real safety boundary, not just for signature
// consistency: refuses to delete a path outside the caller's own
// directory, so a stale/wrong file_path from a bug elsewhere can never
// delete a different account's photo.
export function deletePinBoardPhotoFile(userId, uri) {
  const dir = getPinBoardDir(userId);
  if (!uri.startsWith(dir.uri)) {
    console.error("deletePinBoardPhotoFile: refusing to delete a path outside this user's Pin Board directory", uri);
    return;
  }
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Write-only ("Add Photos Only") permission — deliberately requested with
// writeOnly=true so this only ever prompts for the narrower add-only grant,
// never the broad read permission pickFromLibrary above already covers.
export async function saveToDeviceLibrary(uri) {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return { error: 'Permission to save photos was denied.' };

  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    return { error: null };
  } catch (err) {
    console.error('saveToDeviceLibrary: failed to save photo', err);
    return { error: 'Could not save that photo — please try again.' };
  }
}
