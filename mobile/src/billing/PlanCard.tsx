import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/context';
import { font, makeStyles, radius, space, useColors } from '../theme/tokens';
import { T } from '../ui/Text';
import { Press } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';

/**
 * The plan, always visible on Home, one tap from what to do about it:
 *   trial      → "Pro trial · 5 days left"  [Keep Pro]   → paywall
 *   free       → "Free plan · 3 of 5 deadlines · 1 of 3 scans"  [Go Pro]
 *   no trial   → "Start your 7-day free trial"  [Start]   → Subscription
 *   subscribed → "Duebox Pro · renews Jan 4"  ›          → Subscription
 * A member (not the owner) sees the same card; buying is the owner's, so
 * their tap opens Subscription, which explains that.
 */
export function PlanCard() {
  const router = useRouter();
  const c = useColors();
  const s = useStyles();
  const { plan, isOwner } = useAuth();
  if (!plan) return null;

  const daysLeft = plan.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(plan.trialEndsAt) - Date.now()) / 86_400_000)) : null;
  const endDay = plan.trialEndsAt ? new Date(plan.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const subscribed = plan.tier === 'pro' && plan.source === 'store';
  const trialAvailable = plan.tier === 'free' && !plan.trialUsed;

  let icon: IconName = 'crown';
  let title: string;
  let sub: string;
  let action: string | null;
  let go: () => void;
  const toPaywall = () => router.push({ pathname: '/paywall', params: { reason: 'default' } });
  const toSubscription = () => router.push('/settings/subscription');

  if (plan.isTrial) {
    icon = 'sparkles';
    title = `Pro trial · ${daysLeft === 0 ? 'ends today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}`;
    sub = endDay ? `Unlocked until ${endDay}` : "Everything unlocked";
    action = isOwner ? 'Keep Pro' : null;
    go = isOwner ? toPaywall : toSubscription;
  } else if (subscribed) {
    title = 'Duebox Pro';
    sub = plan.renewsAt ? `Renews ${new Date(plan.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Unlimited deadlines for your household';
    action = null;
    go = toSubscription;
  } else if (trialAvailable && isOwner) {
    icon = 'sparkles';
    title = `Start your ${plan.trialDays}-day free trial`;
    sub = 'Unlimited deadlines and 100 scans — no card';
    action = 'Start';
    go = toSubscription;
  } else {
    title = 'Free plan';
    sub = `${plan.usage.openItems} of ${plan.limits.openItems ?? '∞'} deadlines · ${plan.usage.scansThisMonth} of ${plan.limits.scansPerMonth} scans`;
    action = isOwner ? 'Go Pro' : null;
    go = isOwner ? toPaywall : toSubscription;
  }

  const warm = !subscribed;
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
