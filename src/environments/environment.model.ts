/** Shape shared by every `environment.*.ts` file, so they cannot drift. */
export type AppEnvironment = {
  name: 'dev' | 'staging' | 'prod';
  production: boolean;
  apiBaseUrl: string;
  iamBaseUrl: string;
  notificationWsUrl: string;
  /** flux-web's origin, for links to a task (Copy link). */
  webBaseUrl: string;
  /**
   * About's Privacy policy link. A placeholder in every environment until
   * the store release supplies the real page.
   */
  privacyPolicyUrl: string;
};
