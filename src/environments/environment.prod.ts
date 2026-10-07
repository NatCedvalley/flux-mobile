import type { AppEnvironment } from './environment.model';

export const environment = {
  name: 'prod',
  production: true,
  apiBaseUrl: 'https://operation.api.justflux.asia/api/v1',
  iamBaseUrl: 'https://iam.api.justflux.asia/api/v1',
  notificationWsUrl: 'wss://notification.api.justflux.asia/ws',
  webBaseUrl: 'https://justflux.asia',
} satisfies AppEnvironment;
