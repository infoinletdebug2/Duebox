import { View } from 'react-native';
import { Image } from 'expo-image';
import { makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press } from '../ui/Button';
import { Icon } from '../ui/Icon';

/**
 * A scanned page as a small paper thumbnail with its number (DESIGN-SYSTEM §5
 * PageThumb). PDFs show a file glyph; images show the page itself.
 */
export function PageThumb({
  uri,
  mime,
  index,
  onPress,
  onRemove,
  onRetake,
  width = 76,
}: {
  uri: string | null;
  mime: string;
  index: number;
  onPress?: () => void;
  onRemove?: () => void;
  onRetake?: () => void;
  width?: number;
}) {
  const c = useColors();
  const s = useStyles();
  const height = Math.round(width * 1.3);
  const isPdf = mime === 'application/pdf';
  const body = (
    <View style={[s.thumb, { width, height }]}>
      {uri && !isPdf ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} accessible={false} />
      ) : (
        <View style={s.placeholder}>
          <Icon name={isPdf ? 'file' : 'image'} size={22} color={c.textMuted} />
          {isPdf ? (
            <T variant="micro" tone="muted">
              PDF
            </T>
          ) : null}
        </View>
      )}
      <View style={s.badge}>
        <T variant="micro" style={{ color: '#FFFFFF' }}>
          {index + 1}
        </T>
      </View>
      {onRemove ? (
        <Press onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove page ${index + 1}`} style={s.remove} hitSlop={8}>
          <Icon name="x" size={14} color="#FFFFFF" strokeWidth={3} />
        </Press>
      ) : null}
    </View>
  );
  return (
    <View style={{ gap: space.xs, alignItems: 'center' }}>
      {onPress ? (
        <Press onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`Page ${index + 1}, open full screen`}>
          {body}
        </Press>
      ) : (
        <View accessibilityLabel={`Page ${index + 1}`}>{body}</View>
      )}
      {onRetake ? (
        <T variant="caption" tone="brand" onPress={onRetake} accessibilityRole="button" accessibilityLabel={`Retake page ${index + 1}`}>
          Retake
        </T>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  thumb: { borderRadius: radius.input - 4, overflow: 'hidden', backgroundColor: c.paper, borderWidth: 1, borderColor: c.line },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,15,26,0.6)',
  },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,15,26,0.6)',
  },
}));
