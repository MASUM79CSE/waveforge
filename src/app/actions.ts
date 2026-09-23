import { TOAST_ERROR_MS, TOAST_INFO_MS } from '../core/constants';
import { t } from '../i18n';
import { aboutOpen, toasts, welcomeOpen, type Toast } from './state';

/** User-facing operations. Commands and components call into these. */

let nextToastId = 1;

export function pushToast(
  kind: Toast['kind'],
  message: string,
  action?: Toast['action'],
): void {
  const id = nextToastId++;
  toasts.value = [...toasts.value, { id, kind, message, action }];
  const ttl = kind === 'err' ? TOAST_ERROR_MS : TOAST_INFO_MS;
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

export function toastInfo(message: string): void {
  pushToast('info', message);
}

export function toastError(message: string): void {
  pushToast('err', message);
}

/** Honest placeholder for features landing in a later milestone. */
export function toastNotYet(feature: string, milestone: string): void {
  pushToast('info', t().notYet(feature, milestone));
}

export function openWelcome(): void {
  welcomeOpen.value = true;
}

export function closeWelcome(): void {
  welcomeOpen.value = false;
}

export function openAbout(): void {
  aboutOpen.value = true;
}

export function closeAbout(): void {
  aboutOpen.value = false;
}
