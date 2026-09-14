/** Shape shared by every `environment.*.ts` file, so they cannot drift. */
export interface AppEnvironment {
  name: 'dev' | 'staging' | 'prod';
  production: boolean;
  apiBaseUrl: string;
  iamBaseUrl: string;
  notificationWsUrl: string;
}
