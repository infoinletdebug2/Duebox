import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlanGate } from '../../src/billing/gate';
import { messageOf } from '../../src/api/client';
import { MAX_PAGES, PermissionDenied, pickPdf, pickPhotos, takePhoto, uploadScan, type ScanPage, type ScanSource } from '../../src/lib/scan';
import { makeStyles, radius, space, useColors } from '../../src/theme/tokens';
import { Header, Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Button, Press } from '../../src/ui/Button';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Banner } from '../../src/ui/Feedback';
import { useToast } from '../../src/ui/Sheet';
import { SnapArt } from '../../src/ui/artwork';
import { PageThumb } from '../../src/documents/PageThumb';

/**
 * SCAN (SCREENS #4, FR-S1, FR-S2). Camera (one page at a time, up to 5),
 * photos, or one PDF → upload straight to private storage → the reading
 * screen asks the server to read it. Over the monthly allowance, the paywall.
 */

type Page = ScanPage & { key: string; from: ScanSource };

let pageSeq = 0;
const withKey = (p: ScanPage, from: ScanSource): Page => {
  pageSeq += 1;
  return { ...p, from, key: `p${pageSeq}` };
};

export default function ScanScreen() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const toast = useToast();
  const { guard, handlePlanError } = usePlanGate();

  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPdf = pages.some((p) => p.mime === 'application/pdf');
  const source: ScanSource | null = isPdf ? 'pdf' : (pages[0]?.from ?? null);
  const room = MAX_PAGES - pages.length;

  const onPickError = (e: unknown) => {
    if (e instanceof PermissionDenied) toast({ message: e.message, durationMs: 6000 });
    else toast({ message: messageOf(e) });
  };

  const addImages = (incoming: ScanPage[], from: ScanSource) => {
    if (incoming.length === 0) return;
    setError(null);
    setPages((current) => {
      const base = current.some((p) => p.mime === 'application/pdf') ? [] : current;
      const left = MAX_PAGES - base.length;
      if (incoming.length > left) toast({ message: `A scan can have up to ${MAX_PAGES} pages.` });
      return [...base, ...incoming.slice(0, Math.max(0, left)).map((p) => withKey(p, from))];
    });
  };

  // Web has no camera capture worth using here: fall back to the photo picker.
  const camera = async () => {
    try {
      if (Platform.OS === 'web') return addImages(await pickPhotos(), 'library');
      const shot = await takePhoto();
      if (shot) addImages([shot], 'camera');
    } catch (e) {
      onPickError(e);
    }
  };

  const photos = async () => {
    try {
      addImages(await pickPhotos(), 'library');
    } catch (e) {
      onPickError(e);
    }
  };

  const pdf = async () => {
    try {
      const file = await pickPdf();
      if (!file) return;
      if (pages.length > 0 && !isPdf) toast({ message: 'The PDF replaced the photos you added.' });
      setError(null);
      setPages([withKey(file, 'pdf')]);
    } catch (e) {
      onPickError(e);
    }
  };

  const retake = async (index: number) => {
    try {
      const shot = Platform.OS === 'web' ? (await pickPhotos())[0] : await takePhoto();
      if (shot) setPages((current) => current.map((p, i) => (i === index ? withKey(shot, p.from) : p)));
    } catch (e) {
      onPickError(e);
    }
  };

  const run = async () => {
    if (!source || pages.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress('Getting your pages ready…');
    try {
      const id = await uploadScan(pages, source, (done, total) => {
        setProgress(done < total ? `Uploading page ${done + 1} of ${total}` : 'Uploaded. Starting to read…');
      });
      router.replace({ pathname: '/scan/[id]', params: { id, read: '1' } });
    } catch (e) {
      setBusy(false);
      setProgress(null);
      if (handlePlanError(e)) return;
      setError(messageOf(e));
    }
  };

  return (
    <Screen
      header={<Header title="Scan a letter" closeIcon />}
      testID="screen-scan"
      footer={
        <View style={{ gap: space.sm }}>
          {progress ? (
            <T variant="caption" tone="muted" align="center" accessibilityLiveRegion="polite" testID="scan-progress">
              {progress}
            </T>
          ) : null}
          <Button
            label={pages.length === 0 ? 'Add a page to continue' : 'Read this for me'}
            icon="sparkles"
            disabled={pages.length === 0}
            loading={busy}
            onPress={() => guard('scan_limit', () => void run())}
            testID="scan-upload"
          />
          <Button label="Type it in instead" tone="quiet" small onPress={() => router.replace('/item/new')} disabled={busy} />
        </View>
      }
    >
      {pages.length === 0 ? (
        <View style={{ alignItems: 'center', gap: space.md }}>
          <SnapArt size={210} />
          <T variant="display" align="center" accessibilityRole="header">
            Snap the page with the date
          </T>
          <T tone="muted" align="center" style={{ maxWidth: 330 }}>
            A renewal notice, bill, form or screenshot. We’ll find the deadline and show you where we found it.
          </T>
        </View>
      ) : (
        <View style={{ gap: space.xs }}>
          <T variant="display" accessibilityRole="header">
            {isPdf ? 'PDF ready' : pages.length === 1 ? '1 page ready' : `${pages.length} pages ready`}
          </T>
          <T tone="muted">Add every page that matters — dates are often on the last one.</T>
        </View>
      )}

      {error ? <Banner icon="alert" message={error} onDismiss={() => setError(null)} /> : null}

      <View style={s.tiles}>
        <SourceTile icon="camera" label="Camera" note={Platform.OS === 'web' ? 'Choose photos' : 'One page at a time'} onPress={() => void camera()} disabled={busy || room <= 0} testID="scan-camera" />
        <SourceTile icon="image" label="Photos" note="Pick up to 5" onPress={() => void photos()} disabled={busy || room <= 0} testID="scan-photos" />
        <SourceTile icon="file" label="PDF" note="Up to 15 MB" onPress={() => void pdf()} disabled={busy} testID="scan-pdf" />
      </View>

      {pages.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: space.xs, paddingRight: space.lg }}>
          {pages.map((p, i) => (
            <PageThumb
              key={p.key}
              uri={p.uri}
              mime={p.mime}
              index={i}
              onRemove={busy ? undefined : () => setPages((current) => current.filter((x) => x.key !== p.key))}
              onRetake={!busy && p.from === 'camera' ? () => void retake(i) : undefined}
            />
          ))}
          {!isPdf && room > 0 && !busy ? (
            <Press onPress={() => void (source === 'camera' ? camera() : photos())} accessibilityRole="button" accessibilityLabel="Add page" style={s.addPage} testID="scan-add-page">
              <Icon name="plus" size={22} color={c.brandInk} />
              <T variant="caption" tone="brand">
                Add page
              </T>
            </Press>
          ) : null}
        </ScrollView>
      ) : (
        <View style={s.tips}>
          <Tip text="Lay the page flat in good light" />
          <Tip text="Keep all four corners in the photo" />
          <Tip text="Screenshots of emails work too" />
        </View>
      )}

      <View style={s.privacy}>
        <Icon name="lock" size={16} color={c.textMuted} />
        <T variant="caption" tone="muted" style={{ flex: 1 }}>
          Pages upload to private storage. The AI service that reads them isn’t allowed to keep or learn from them.
        </T>
      </View>
    </Screen>
  );
}

function Tip({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Icon name="check" size={16} color={c.good} />
      <T variant="callout" tone="muted">
        {text}
      </T>
    </View>
  );
}

function SourceTile({ icon, label, note, onPress, disabled, testID }: { icon: IconName; label: string; note: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const c = useColors();
  const s = useStyles();
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}. ${note}`} style={s.tile} testID={testID}>
      <View style={s.tileIcon}>
        <Icon name={icon} size={24} color={c.brandInk} />
      </View>
      <T variant="headline" align="center">
        {label}
      </T>
      <T variant="caption" tone="muted" align="center" numberOfLines={2}>
        {note}
      </T>
    </Press>
  );
}

const useStyles = makeStyles((c) => ({
  tiles: { flexDirection: 'row', gap: space.md },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft, marginBottom: space.xs },
  addPage: {
    width: 76,
    height: 99,
    borderRadius: radius.input - 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.brandInk,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  tips: { gap: space.sm, paddingHorizontal: space.xs },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
}));
