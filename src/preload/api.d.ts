import type { CompanionApi } from '../shared/ipc';

declare global {
  interface Window {
    readonly companion: CompanionApi;
  }
}

export {};
