import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/context';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';

/**
 * The subscription, on Home, one tap from Subscription settings. Behind the
 * hard paywall Home is only ever seen subscribed, so there are four states:
 *   trial      → "Free trial · 2 days left"   "First charge Jan 4" (or "Ends Jan 4" once cancelled)
 *   grace      → "Payment problem"            "Update your payment method"   (warm)
 *   cancelled  → "Duebox Pro"                 "Ends Jan 4"                   (warm)
 *   renewing   → "Duebox Pro"                 "Renews Jan 4"
 * A member (not the owner) sees the same card; Subscription explains that
 * only the owner manages it.
 */
export function PlanCard() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const { plan } = useAuth();
  if (!plan || !plan.entitled) return null;

  const short = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null);
  const daysLeft = plan.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(plan.trialEndsAt) - Date.now()) / 86_400_000)) : null;
  const go = () => router.push('/settings/subscription');

  let icon: IconName = 'crown';
  let title: string;
  let sub: string;
  let action: string | null = null;
  let warm = false;

  if (plan.isTrial) {
    icon = 'sparkles';
    title = `Free trial · ${daysLeft === 0 ? 'ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}`;
    sub = plan.willRenew ? `First charge ${short(plan.trialEndsAt) ?? 'when it ends'}` : `Ends ${short(plan.trialEndsAt) ?? 'soon'} — you’ve cancelled`;
    warm = !plan.willRenew;
  } else if (plan.status === 'grace') {
    icon = 'alert';
    title = 'Payment problem';
    sub = 'Update your payment method to keep Duebox';
    action = 'Fix';
    warm = true;
  } else if (!plan.willRenew && plan.expiresAt) {
    title = 'Duebox Pro';
    sub = `Ends ${short(plan.expiresAt)} — renew to keep reminders`;
    warm = true;
  } else {
    title = 'Duebox Pro';
    sub = plan.renewsAt ? `Renews ${short(plan.renewsAt)}` : 'Every deadline, for your whole household';
  }

  return (
    <Press onPress={go} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={[s.card, warm ? s.warm : s.calm]} testID="home-plan">
      <View style={[s.icon, { backgroundColor: warm ? c.accent : c.brandSoft }]}>
        <Icon name={icon} size={18} color={warm ? c.accentInk : c.brandInk} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="callout" numberOfLines={1}>
          {title}
        </T>
        <T variant="caption" tone="muted" numberOfLines={1}>
          {sub}
        </T>
      </View>
      {action ? (
        <View style={s.cta}>
          <T variant="caption" style={{ color: c.onBrand, fontFamily: font.bold }}>
            {action}
          </T>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={c.textMuted} />
      )}
    </Press>
  );
}

const useStyles = makeStyles((c) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.group, borderWidth: 1, padding: space.md },
  warm: { backgroundColor: c.accentSoft, borderColor: c.accent },
  calm: { backgroundColor: c.surface, borderColor: c.line },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cta: { backgroundColor: c.brand, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.chip },
}));
