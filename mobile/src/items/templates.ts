import type { Action, Category, Repeat } from '../types';

/**
 * One-tap starting points for "New item" — the deadlines most households
 * have. Each fills the title, category, action and repeat, so typing one in
 * is a date away. Ordered by how often people have them.
 */
export interface Template {
  title: string;
  category: Category;
  action: Action;
  repeat: Repeat;
  repeatYears?: number;
}

export const TEMPLATES: Template[] = [
  { title: 'Car insurance', category: 'insurance', action: 'renew', repeat: 'yearly' },
  { title: 'Car registration', category: 'vehicle', action: 'renew', repeat: 'yearly' },
  { title: 'Free trial ends', category: 'subscriptions', action: 'cancel', repeat: 'none' },
  { title: 'Passport renewal', category: 'id_travel', action: 'renew', repeat: 'years', repeatYears: 10 },
  { title: 'Home insurance', category: 'home', action: 'renew', repeat: 'yearly' },
  { title: 'Rent', category: 'bills', action: 'pay', repeat: 'monthly' },
  { title: 'Driving licence', category: 'id_travel', action: 'renew', repeat: 'years', repeatYears: 10 },
  { title: 'School form', category: 'kids_school', action: 'submit', repeat: 'none' },
  { title: 'Dentist check-up', category: 'health', action: 'book', repeat: 'half_yearly' },
  { title: 'Property tax', category: 'bills', action: 'pay', repeat: 'half_yearly' },
];
