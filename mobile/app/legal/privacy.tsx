import { SUPPORT_EMAIL } from '../../src/config';
import { LegalScreen, type LegalSection } from '../../src/account/LegalScreen';

/**
 * PRIVACY POLICY (store-readiness.md: a native screen, never a link that can
 * 404). Written from what the code actually does — every category below is
 * one the app or the worker really handles, and nothing else. The App Store
 * label should read: contact info, user content; not used for tracking.
 *
 * DRAFT: generated text needs a qualified legal review before release.
 *
 * Exported constants above the default export so a website build can reuse
 * them; import nothing but config.
 */
export const EFFECTIVE = 'October 5, 2026';

export const SUMMARY = [
  'Duebox keeps track of your deadlines. We collect only what that needs.',
  'Your items and scanned pages are private to your household. Only you and the people you invite can see them.',
  'To read a letter, we send its images to an AI service that is not allowed to keep them or learn from them. Reference numbers are cut to the last 4 digits.',
  'No ads, no trackers, no data brokers. We never sell your data.',
  'Export everything or delete your account inside the app, anytime, free.',
];

export const SECTIONS: LegalSection[] = [
  {
    heading: 'Who we are',
    body: [
      `Duebox is a deadline-reminder app operated by InfoInlet (“we”, “us”). You photograph a letter, bill or form, Duebox reads the deadline, and reminds you before it is due. This policy explains what we collect, why, and the choices you have. Contact us at ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'Account information. Your email address, your name and — if you use one — a password, which our authentication provider stores only as a secure hash. If you sign in with Apple or Google we receive your email address (or Apple’s private relay address) and, the first time, your name.',
      'Your household. Its name, time zone, currency, the time you want reminders, and the people who join it (their name and email).',
      'Your items. For each deadline: the title, category, what to do, the due date, and anything you add — an amount, who it is from, the last 4 characters of a reference number, notes, how often it repeats, reminder settings and who handles it.',
      'Scanned pages and attachments. The photos and PDFs you add. Photos are re-encoded on your phone before upload, which removes location and other camera metadata.',
      'Device information for reminders. If you turn on notifications, a push token for your phone and whether it is iOS or Android.',
      'Purchases. If you subscribe, the store transaction identifier and the plan, so we can confirm it with Apple or Google. We never see your card details.',
      'Basic usage counts. How many items and scans your household has this month — to apply plan limits. Not what they say.',
    ],
  },
  {
    heading: 'What we don’t collect',
    body: [
      {
        bullets: [
          'No advertising identifiers, no third-party analytics or tracking SDKs.',
          'No location, contacts or microphone.',
          'No full reference, policy, account or passport numbers — only the last 4 characters are ever stored.',
          'No bank connection and no payment card details.',
        ],
      },
    ],
  },
  {
    heading: 'How we use it',
    body: [
      {
        bullets: [
          'To read your scans and suggest the deadline, amount and sender — which you always confirm before anything is saved.',
          'To send the reminders you asked for, at the time you chose.',
          'To share items with the members of your household.',
          'To apply your plan’s limits and verify subscriptions with Apple or Google.',
          'To keep the service secure and fix problems. Error logs never contain the text of your documents.',
        ],
      },
      'We do not use your data for advertising, sell it, or share it with data brokers.',
    ],
  },
  {
    heading: 'Who processes it for us',
    body: [
      'Our backend runs on Cloudflare and stores data in a managed Postgres database and private file storage through our infrastructure provider, Xenition. Files are reachable only through links that expire after 15 minutes.',
      'Document reading. To read a scan, our server sends the page images through Xenition to an AI model on OpenRouter, with data collection switched off: the provider may process the images only to return the reading, and may not keep them or use them to train models. Your phone never contacts the AI service directly.',
      'Push notifications are delivered through Expo’s push service and Apple Push Notification service or Firebase Cloud Messaging. A notification contains the item title, when it is due and the amount, if any.',
      'Apple and Google process subscription payments under their own privacy policies.',
    ],
  },
  {
    heading: 'Your household',
    body: [
      'Everyone in a household sees all of its items and attachments. The owner can invite and remove members. If you leave a household, its items stay with it.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'We keep your data while your account exists. Deleting an item deletes its attachments and reminders. Deleting your account deletes your data from the app straight away and from our systems, including backups, within 30 days. If you are the household owner, that includes the whole household for everyone in it.',
    ],
  },
  {
    heading: 'Your choices and rights',
    body: [
      {
        bullets: [
          'Export: Settings → Export my data, as CSV or JSON, free.',
          'Delete: Settings → Delete account, free.',
          'Notifications: choose which reminders you get in Settings → Notifications, or turn them off in your phone’s settings.',
          'Correct: edit any item at any time.',
        ],
      },
      `Depending on where you live (for example, the EU, UK or California), you may also have rights to access, correct, delete or port your data and to object to processing. Email ${SUPPORT_EMAIL} and we will respond within 30 days. We rely on performing our contract with you to process your data.`,
    ],
  },
  {
    heading: 'Security',
    body: [
      'Your sign-in is stored in your phone’s secure keychain. Data travels over encrypted connections. Files are private and served only through short-lived links. No system is perfectly secure; if a breach affects you, we will tell you as the law requires.',
    ],
  },
  {
    heading: 'Children',
    body: ['Duebox is for adults. We do not knowingly collect data from children under 13 (or 16 where required).'],
  },
  {
    heading: 'Changes',
    body: ['If we change this policy materially, we will tell you in the app before the change takes effect. The date at the top shows the current version.'],
  },
];

export default function Privacy() {
  return <LegalScreen title="Privacy Policy" effective={EFFECTIVE} summary={SUMMARY} sections={SECTIONS} testID="screen-privacy" />;
}
