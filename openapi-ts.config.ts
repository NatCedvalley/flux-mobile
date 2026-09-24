// Config for `npm run api:generate`. Regenerates src/core/api/generated/ from
// the flux-operations and flux-iam OpenAPI specs, one folder per service (each
// job wipes its own output folder, and the specs share some operation names).
// Both services must be running locally with springdoc's api-docs enabled —
// start them with the flux repo's docker dev stack (see CLAUDE.md §4). Output
// is committed so builds never need the backend.
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig([
  {
    input: 'http://localhost:9003/v3/api-docs',
    output: 'src/core/api/generated/operations',
    plugins: ['@hey-api/typescript'],
  },
  {
    input: 'http://localhost:9001/v3/api-docs',
    output: 'src/core/api/generated/iam',
    plugins: ['@hey-api/typescript'],
  },
]);
