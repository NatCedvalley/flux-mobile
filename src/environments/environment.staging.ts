import type { AppEnvironment } from './environment.model';

// TODO: placeholder URLs copied from flux-web, which also has not filled
// these in yet — replace once staging infrastructure exists.
export const environment = {
  name: 'staging',
  production: false,
  apiBaseUrl: 'https://staging-api.flux.example.com/api/v1',
  iamBaseUrl: 'https://staging-iam.flux.example.com/api/v1',
  notificationWsUrl: 'https://staging-notification.flux.example.com/ws',
} satisfies AppEnvironment;
