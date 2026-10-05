import { Linking, View } from 'react-native';
import { SUPPORT_EMAIL } from '../config';
import { space } from '../theme/tokens';
import { Screen, Header } from '../ui/Screen';
import { T } from '../ui/Text';

/**
 * Terms and Privacy share one reading layout: a title, the date it took
 * effect, a short plain-English summary, then numbered sections. Reachable
 * signed out (the root guard lets `legal` through) because both stores
 * require the links before an account exists.
 *
 * Content is data — paragraphs and bullet lists — so the two documents stay
 * prose and never grow layout code of their own.
 */
export type LegalBlock = string | { bullets: string[] };

export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}

interface LegalScreenProps {
  title: string;
  effective: string;
  summary: string[];
  sections: LegalSection[];
  testID?: string;
}

export function LegalScreen({ title, effective, summary, sections, testID }: LegalScreenProps) {
  return (
    <Screen header={<Header title={title} />} testID={testID}>
      <View style={{ gap: space.sm }}>
        <T variant="display" accessibilityRole="header">
          {title}
        </T>
        <T variant="caption" tone="muted">
          Effective {effective}
        </T>
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="micro" tone="muted">
          The short version
        </T>
        <Bullets items={summary} />
      </View>

      {sections.map((section, i) => (
        <View key={section.heading} style={{ gap: space.sm }}>
          <T variant="title" accessibilityRole="header">
            {i + 1}. {section.heading}
          </T>
          {section.body.map((block, j) =>
            typeof block === 'string' ? (
              <T key={j} style={{ lineHeight: 24 }}>
                {block}
              </T>
            ) : (
              <Bullets key={j} items={block.bullets} />
            ),
          )}
        </View>
      ))}

      <View style={{ gap: space.xs }}>
        <T variant="caption" tone="muted">
          Questions? Write to{' '}
          <T
            variant="caption"
            tone="brand"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined)}
            style={{ textDecorationLine: 'underline' }}
          >
            {SUPPORT_EMAIL}
          </T>
          .
        </T>
      </View>
    </Screen>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: space.xs }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: space.sm, paddingRight: space.sm }}>
          <T tone="brand" style={{ lineHeight: 24 }}>
            •
          </T>
          <T style={{ flex: 1, lineHeight: 24 }}>{item}</T>
        </View>
      ))}
    </View>
  );
}
