// Public surface of the API layer. Import from '@core/api', never reach into
// a submodule directly — this is the seam that stays stable when hand-written
// types are replaced by generated ones.
export type { FluxApi } from './flux-api';
export * from './types';
