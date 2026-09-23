import { aboutOpen, welcomeOpen } from './state';

/**
 * Global keyboard manager (M0: dialog dismissal). Transport/edit bindings
 * arrive with their features (M1/M2) through the command registry.
 */
export function bindKeyboard(): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (aboutOpen.value) {
      aboutOpen.value = false;
      return;
    }
    if (welcomeOpen.value) {
      welcomeOpen.value = false;
    }
  });
}
