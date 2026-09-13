/** Mirrors the Notification DTO exposed by the Spring Boot backend. */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  taskId?: string;
}
