/**
 * Toast helpers (own module since M8f+ — breaks the projectActions ↔
 * actions import cycle; actions.ts re-exports for compatibility).
 * Pure signal + timer glue.
 */
import { TOAST_ERROR_MS, TOAST_INFO_MS } from '../core/constants';
import type { Toast } from './state';
import * as S from './state';

let nextToastId = 1;

export function pushToast(kind: Toast['kind'], message: string, action?: Toast['action']): void {
  const id = nextToastId++;
  S.toasts.value = [...S.toasts.value, { id, kind, message, action }];
  const ttl = kind === 'err' ? TOAST_ERROR_MS : TOAST_INFO_MS;
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  S.toasts.value = S.toasts.value.filter((toast) => toast.id !== id);
}

export function toastInfo(message: string): void {
  pushToast('info', message);
}

export function toastError(message: string): void {
  pushToast('err', message);
}
