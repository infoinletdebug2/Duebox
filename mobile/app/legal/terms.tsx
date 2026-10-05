import { SUPPORT_EMAIL, TRIAL_DAYS } from '../../src/config';
import { LegalScreen, type LegalSection } from '../../src/account/LegalScreen';

/**
 * TERMS OF USE (store-readiness.md: native, reachable from the paywall and
 * settings, signed in or out). DRAFT: needs a qualified legal review before
 * release.
 */
export const EFFECTIVE = 'October 4, 2026';

export const SUMMARY = [
  'Duebox helps you remember deadlines. It is a reminder tool, not a guarantee.',
  'Always check the date we read against the letter — you confirm every item before it is saved.',
  'Free has limits; Pro removes them. Subscriptions renew until you cancel in your store account.',
  'Your data is yours. Export or delete it anytime.',
];

export const SECTIONS: LegalSection[] = [
  {
    heading: 'Agreement',
    body: [
      'These terms are an agreement between you and InfoInlet (“we”, “us”) for the Duebox apps and services. By creating an account you agree to them. If you don’t agree, please don’t use Duebox.',
    ],
  },
  {
    heading: 'What Duebox does — and doesn’t',
    body: [
      'Duebox reads documents you add, suggests deadlines and sends reminders. Reading is automatic and can be wrong: a date, amount or sender may be misread or missed. You are responsible for checking each item against the original document before you save it, and for meeting your own deadlines.',
      'Reminders depend on your phone, its notification settings, your connection and third-party services. We do our best to deliver every reminder on time, but we can’t guarantee delivery. Please don’t rely on Duebox as your only record of a critical deadline.',
      'Duebox is not legal, financial or tax advice.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You must be an adult able to form a binding contract. Keep your sign-in secure; you are responsible for activity on your account. A household owner can invite members, and everyone in a household can see and change its items.',
    ],
  },
  {
    heading: 'Plans and subscriptions',
    body: [
      {
        bullets: [
          'Free: up to 5 open deadlines, 3 scans a month, and default reminders, for one person.',
          'Pro: unlimited open deadlines, up to 100 scans a month (fair use), custom reminders and a household of up to 5 people.',
          `Pro is an auto-renewing subscription, billed monthly or yearly through the App Store or Google Play. The yearly plan may include a ${TRIAL_DAYS}-day free trial; you can cancel before it ends at no charge.`,
          'Your subscription renews at the same price each period unless you cancel at least 24 hours before the period ends, in your App Store or Google Play account settings. Deleting the app does not cancel it.',
          'Refunds are handled by Apple or Google under their policies.',
          'If Pro ends, nothing is deleted or hidden. You can still view, complete, export and delete everything; adding over the free limits needs Pro again.',
        ],
      },
    ],
  },
  {
    heading: 'Your content',
    body: [
      'You own what you add. You give us permission to store, process and display it only to provide Duebox to you and your household — including sending document images to our AI reading provider as described in the Privacy Policy. Only add documents you have the right to use.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'Don’t misuse Duebox: no attempts to access other households’ data, to overload or reverse-engineer the service, or to use it for anything unlawful. We may suspend accounts that do.',
    ],
  },
  {
    heading: 'Ending',
    body: [
      'You can delete your account at any time in Settings. We may end or suspend the service, or your account if you break these terms, with notice where we reasonably can. You can export your data before deleting.',
    ],
  },
  {
    heading: 'Liability',
    body: [
      'Duebox is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential losses, including late fees, penalties or lapsed cover resulting from a missed or misread deadline, and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have under consumer law that cannot be limited.',
    ],
  },
  {
    heading: 'Changes and contact',
    body: [
      `We may update these terms; we will tell you in the app before material changes take effect. Questions: ${SUPPORT_EMAIL}.`,
    ],
  },
];

export default function Terms() {
  return <LegalScreen title="Terms of Use" effective={EFFECTIVE} summary={SUMMARY} sections={SECTIONS} testID="screen-terms" />;
}
