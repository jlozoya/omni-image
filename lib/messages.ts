import type { RegionRect } from './types';

export type ExtensionMessage =
  | { type: 'START_CAPTURE' }
  | { type: 'START_FULL_CAPTURE' }
  | { type: 'REGION_SELECTED'; rect: RegionRect }
  | { type: 'REGION_CANCELLED' }
  | { type: 'CAPTURE_STATUS'; ok: boolean; message: string };
