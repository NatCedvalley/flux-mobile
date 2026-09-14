// Config for `npm run api:generate`. Regenerates src/core/api/generated/ from
// the flux-operations OpenAPI spec. The backend must be running locally with
// springdoc's api-docs enabled (on by default for dev/staging; off for prod —
// see CLAUDE.md §4). Output is committed so builds never need the backend.
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'http://localhost:9003/v3/api-docs',
  output: 'src/core/api/generated',
  plugins: ['@hey-api/typescript'],
});
