/**
 * Mirrors the Task DTO exposed by the Spring Boot backend. Dates are ISO 8601
 * strings (not `Date` objects) so values are JSON-safe and the type is
 * portable to any future UI layer (Flutter, native).
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: string;
  updatedAt: string;
}
