import { Injectable, inject } from '@angular/core';
import type { MyProject } from '@core/api';
import { can, type ProjectAction, type ProjectRole } from '@core/permissions';
import { AuthService } from '../auth/auth.service';
import { FLUX_API } from '../providers/flux-api.token';

/** The server's page cap: more projects than this aren't listed. */
const PROJECTS_PAGE_SIZE = 100;

/**
 * The caller's projects from GET /projects/mine, with their role in each,
 * fetched once per signed-in account and shared by every screen. A failed
 * fetch isn't kept, so the next call tries again.
 */
@Injectable({ providedIn: 'root' })
export class MyProjectsService {
  private readonly api = inject(FLUX_API);
  private readonly account = inject(AuthService).account;
  private cache:
    | { accountId: string | undefined; projects: Promise<MyProject[]> }
    | undefined;

  load(): Promise<MyProject[]> {
    const accountId = this.account()?.id;
    if (this.cache?.accountId !== accountId) {
      this.cache = undefined;
    }
    if (!this.cache) {
      const projects = this.fetch();
      this.cache = { accountId, projects };
      projects.catch(() => {
        if (this.cache?.projects === projects) {
          this.cache = undefined;
        }
      });
    }
    return this.cache.projects;
  }

  /** Drops the cached list, so the next `load` fetches fresh counts. */
  invalidate(): void {
    this.cache = undefined;
  }

  /** The caller's role in a project; undefined when not a member. */
  async role(projectId: string): Promise<ProjectRole | undefined> {
    const projects = await this.load();
    return projects.find((p) => p.project?.id === projectId)?.role;
  }

  /** Whether the caller's role in a project allows `action`. */
  async can(projectId: string, action: ProjectAction): Promise<boolean> {
    return can(await this.role(projectId), action);
  }

  private async fetch(): Promise<MyProject[]> {
    const page = await this.api.listMyProjects({
      // The day overdue counts are counted from.
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      size: PROJECTS_PAGE_SIZE,
    });
    return page.content ?? [];
  }
}
