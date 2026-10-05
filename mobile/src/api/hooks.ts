import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { coreActionCompleted } from '../lib/analytics';
import { noteFirstScan } from '../lib/review';
import { api, newIdempotencyKey } from './client';
import type { Home, Invite, Item, ItemDetail, ItemInput, ItemStatus, Me, Member, Plan, Prefs, Scan, Category } from '../types';

/**
 * Every server read and write as hooks (docs/CONTRACT.md §2). One place owns
 * the cache keys, so a write invalidates exactly what it changed.
 */

export const keys = {
  home: ['home'] as const,
  items: ['items'] as const,
  list: (status: ItemStatus, category: string, q: string) => ['items', 'list', status, category, q] as const,
  item: (id: string) => ['items', 'one', id] as const,
  scan: (id: string) => ['scans', id] as const,
  members: ['members'] as const,
  invites: ['invites'] as const,
  plan: ['plan'] as const,
};

/** After anything that changes an item, a list or a count. */
export function invalidateItems(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.home });
  void qc.invalidateQueries({ queryKey: keys.items });
  void qc.invalidateQueries({ queryKey: keys.plan });
}

/* ── reads ──────────────────────────────────────────────────────────────── */

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => api.get<Home>('/home') });

export const useItems = (status: ItemStatus, category: Category | 'all', q: string) =>
  useQuery({
    queryKey: keys.list(status, category, q),
    queryFn: () =>
      api.get<{ items: Item[]; nextCursor: string | null }>('/items', {
        status,
        category: category === 'all' ? undefined : category,
        q: q.trim() || undefined,
      }),
  });

export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => api.get<ItemDetail>(`/items/${id}`), enabled: Boolean(id) });

export const useScan = (id: string, poll = false) =>
  useQuery({
    queryKey: keys.scan(id),
    queryFn: () => api.get<Scan>(`/scans/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (poll && query.state.data?.status === 'reading' ? 2000 : false),
  });

export const useMembers = () => useQuery({ queryKey: keys.members, queryFn: () => api.get<Member[]>('/household/members') });
export const useInvites = (enabled: boolean) => useQuery({ queryKey: keys.invites, queryFn: () => api.get<Invite[]>('/household/invites'), enabled });
export const usePlan = () => useQuery({ queryKey: keys.plan, queryFn: () => api.get<Plan>('/billing/plan') });

/* ── item writes ────────────────────────────────────────────────────────── */

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemInput) => api.post<ItemDetail>('/items', input),
    onSuccess: () => {
      invalidateItems(qc);
      coreActionCompleted('manual');
    },
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ItemInput>) => api.patch<ItemDetail>(`/items/${id}`, input),
    onSuccess: (detail) => {
      qc.setQueryData(keys.item(id), detail);
      invalidateItems(qc);
    },
  });
}

export function useMarkDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ item: Item; next: Item | null }>(`/items/${id}/done`, undefined, newIdempotencyKey()),
    onSuccess: () => invalidateItems(qc),
  });
}

export function useReopen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Item>(`/items/${id}/reopen`),
    onSuccess: () => invalidateItems(qc),
  });
}

export function useSnooze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: 1 | 3 | 7 }) => api.post<Item>(`/items/${id}/snooze`, { days }, newIdempotencyKey()),
    onSuccess: () => invalidateItems(qc),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/items/${id}`),
    onSuccess: () => invalidateItems(qc),
  });
}

export function useDeleteAttachment(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => api.delete(`/items/${itemId}/attachments/${documentId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.item(itemId) });
      invalidateItems(qc);
    },
  });
}

/* ── scans ──────────────────────────────────────────────────────────────── */

export function useReadScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Scan>(`/scans/${id}/read`),
    onSuccess: (scan) => {
      qc.setQueryData(keys.scan(scan.id), scan);
      invalidateItems(qc);
    },
  });
}

export function useConfirmScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: (ItemInput & { candidateKey?: string })[]) => api.post<{ items: ItemDetail[] }>(`/scans/${id}/confirm`, { items }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.scan(id) });
      invalidateItems(qc);
      coreActionCompleted('scan');
      // The review box comes after the first scan: Duebox has just read a letter for them.
      void noteFirstScan();
    },
  });
}

export function useDiscardScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/scans/${id}`),
    onSuccess: () => invalidateItems(qc),
  });
}

/* ── me, household ──────────────────────────────────────────────────────── */

export function useUpdateMe() {
  return useMutation({ mutationFn: (input: { name?: string; prefs?: Partial<Prefs> }) => api.patch<Me>('/auth/me', input) });
}

export function useUpdateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; timezone?: string; currency?: string; remindHour?: number }) => api.patch<Me>('/household', input),
    onSuccess: () => invalidateItems(qc),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Invite>('/household/invites'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.invites }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.invites }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/members/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.members });
      invalidateItems(qc);
    },
  });
}
