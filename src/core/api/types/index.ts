// Hand-written today. Once springdoc-openapi ships on the backend, generated
// types will land in `src/core/api/generated/` and the exports below will
// point there instead — call sites that `import { Task } from '@core/api'`
// will not need to change.
export * from './task';
export * from './notification';
