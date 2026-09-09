import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { C, withAlpha } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/Button';
import WallpaperBackground from '../components/WallpaperBackground';
import {
  planPhotoBackup,
  writePhotoBackupContainer,
  copyPickedFileToLocalCache,
  readPhotoBackupManifest,
  validManifestEntryIds,
  importPhotoBackupContainer,
} from '../lib/photoBackup';

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.min(1, current / total) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export default function PhotoBackup() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [exportStatus, setExportStatus] = useState('');

  const [pickedFile, setPickedFile] = useState(null);
  const [pickedManifest, setPickedManifest] = useState(null);
  const [pickError, setPickError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);

  async function handleExport() {
    setExportStatus('');
    setExportProgress(null);
    setExporting(true);
    try {
      const plan = await planPhotoBackup(userId);
      if (plan.photoCount === 0) {
        setExportStatus(
          plan.skippedPublicCount > 0
            ? "Nothing to back up — every local photo is already public and safely stored in the cloud."
            : 'Nothing to back up yet — no Pin Board photos found.'
        );
        setExporting(false);
        return;
      }

      const file = await writePhotoBackupContainer(plan, { onProgress: setExportProgress });
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'DayTickles Photo Backup',
      });

      setExportStatus(
        plan.skippedPublicCount > 0
          ? `Backup includes ${plan.photoCount} photo${plan.photoCount === 1 ? '' : 's'} (${plan.skippedPublicCount} already-public photo${plan.skippedPublicCount === 1 ? ' was' : 's were'} skipped — they're safely stored in the cloud already).`
          : `Backup includes ${plan.photoCount} photo${plan.photoCount === 1 ? '' : 's'}.`
      );
    } catch (err) {
      console.error('handleExport: failed', err);
      setExportStatus('Something went wrong creating the backup — please try again.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  async function handlePickFile() {
    setPickError('');
    setPickedManifest(null);
    setImportResult(null);
    try {
      const result = await File.pickFileAsync();
      const picked = Array.isArray(result) ? result[0] : result;
      if (!picked) return;

      const localFile = await copyPickedFileToLocalCache(picked);
      const manifest = await readPhotoBackupManifest(localFile);
      setPickedFile(localFile);
      setPickedManifest(manifest);
    } catch (err) {
      console.error('handlePickFile: failed', err);
      setPickError(err.message || "That file couldn't be read as a DayTickles backup.");
    }
  }

  function confirmImport() {
    const photoCount = pickedManifest.photos.length;
    Alert.alert(
      'Import this backup?',
      `This will add ${photoCount} photo${photoCount === 1 ? '' : 's'} to your Pin Board. If you've already restored this backup before, importing it again will create duplicate photos — there's no automatic duplicate detection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: handleImport },
      ]
    );
  }

  async function handleImport() {
    setImporting(true);
    setImportProgress(null);
    try {
      const validEntryIds = await validManifestEntryIds(pickedManifest, userId);
      const result = await importPhotoBackupContainer(userId, pickedFile, pickedManifest, validEntryIds, {
        onProgress: setImportProgress,
      });
      setImportResult(result);
      setPickedManifest(null);
      setPickedFile(null);
    } catch (err) {
      console.error('handleImport: failed', err);
      setPickError('Something went wrong importing this backup — please try again.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  return (
    <WallpaperBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Backup & Restore Photos</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Export</Text>
          <Text style={styles.explainerText}>
            Creates a single file with every Pin Board photo and private Photo-Only Tickle photo
            you haven't made public — these live only on this device and are never uploaded
            anywhere else. Already-public Photo-Only Tickles are skipped, since their photo is
            already safely stored in the cloud.
          </Text>
          <View style={styles.spacer} />

          <Button
            title={exporting ? 'Creating backup…' : 'Create Backup File'}
            onPress={handleExport}
            disabled={exporting || importing}
          />

          {exporting && exportProgress && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.progressLabel}>
                Copying photo {exportProgress.photoIndex} of {exportProgress.photoCount}
              </Text>
              <ProgressBar current={exportProgress.photoIndex} total={exportProgress.photoCount} />
            </>
          )}
          {!!exportStatus && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.explainerText}>{exportStatus}</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Import</Text>
          <Text style={styles.explainerText}>
            Brings photos back in from a DayTickles backup file — from this device or another
            one. Only links to Tickles that still exist on this account are restored; anything
            else is skipped.
          </Text>
          <Text style={[styles.explainerText, styles.warningText]}>
            If you've already restored this backup before, importing it again will create
            duplicate photos — there's no automatic duplicate detection yet.
          </Text>
          <View style={styles.spacer} />

          <Button
            title="Choose Backup File"
            onPress={handlePickFile}
            disabled={exporting || importing}
            variant="secondary"
          />

          {!!pickError && (
            <>
              <View style={{ height: 12 }} />
              <Text style={[styles.explainerText, styles.warningText]}>{pickError}</Text>
            </>
          )}

          {pickedManifest && !importing && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.explainerText}>
                This backup has {pickedManifest.photos.length} photo
                {pickedManifest.photos.length === 1 ? '' : 's'}, exported{' '}
                {new Date(pickedManifest.exportedAt).toLocaleDateString()}.
              </Text>
              <View style={{ height: 12 }} />
              <Button title="Import" onPress={confirmImport} />
            </>
          )}
          {importing && importProgress && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.progressLabel}>
                Restoring photo {importProgress.photoIndex} of {importProgress.photoCount}
              </Text>
              <ProgressBar current={importProgress.photoIndex} total={importProgress.photoCount} />
            </>
          )}
          {importResult && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.explainerText}>
                Imported {importResult.importedCount} photo{importResult.importedCount === 1 ? '' : 's'}.
                {importResult.skippedLinkCount > 0
                  ? ` ${importResult.skippedLinkCount} link${importResult.skippedLinkCount === 1 ? ' was' : 's were'} skipped — the matching Tickle no longer exists on this account.`
                  : ''}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </WallpaperBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backLink: { fontSize: 16, color: C.rust, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: C.rustDark, marginBottom: 24 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16,
    backgroundColor: withAlpha(C.subtext, 0.1), borderColor: C.border,
  },
  label: { fontSize: 14, color: C.subtext, marginBottom: 10 },
  explainerText: { fontSize: 12, color: C.subtext, lineHeight: 16 },
  warningText: { color: C.error, marginTop: 8 },
  spacer: { height: 12 },
  progressLabel: { fontSize: 13, color: C.text, marginBottom: 6 },
  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: C.border, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 4, backgroundColor: C.rust,
  },
});
