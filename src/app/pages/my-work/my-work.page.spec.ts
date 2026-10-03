import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FluxApi } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { MyWorkPage } from './my-work.page';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('MyWorkPage', () => {
  let fixture: ComponentFixture<MyWorkPage>;
  let api: FluxApi;

  async function create(withApi: FluxApi = new InMemoryFluxApi()) {
    api = withApi;
    await TestBed.configureTestingModule({
      imports: [MyWorkPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api },
        {
          provide: AuthService,
          useValue: {
            account: signal({
              id: 'account-1',
              firstName: 'Ada',
              lastName: 'Rahman',
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyWorkPage);
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texts(selector: string): string[] {
    return Array.from(element().querySelectorAll(selector)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  async function selectSegment(value: string): Promise<void> {
    const segment = element().querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    await settle();
  }

  it('shows the screen title', async () => {
    await create();
    expect(element().querySelector('h1')?.textContent).toBe('My Work');
  });

  it("shows the account's initials on an avatar that opens Settings", async () => {
    await create();
    const button = element().querySelector('.avatar-button');

    expect(button?.getAttribute('routerLink')).toBe('settings');
    expect(button?.querySelector('.avatar')?.textContent?.trim()).toBe('AR');
  });

  it('shows the open assigned count in the subtitle', async () => {
    await create();
    await settle();
    expect(texts('.subtitle')[0]).toMatch(/· 5 assigned$/);
  });

  it('groups Focus into Overdue, Today and Next 7 days', async () => {
    await create();
    await settle();

    expect(texts('ion-item-divider')).toEqual([
      'Overdue · 1',
      'Today · 1',
      'Next 7 days · 2',
    ]);
    expect(texts('app-task-row .title')).toEqual([
      'Fix 3DS redirect on Safari',
      'Review pull request #482',
      'Prorate plan upgrades',
      'Speed up the order summary query',
    ]);
  });

  it('shows the row anatomy: status, second fact, key and project', async () => {
    await create();
    await settle();

    const row = element().querySelector('app-task-row')!;
    expect(iconName(row.querySelector('ion-icon.type'))).toBe('bug');
    expect(row.querySelector('.type')?.classList).toContain('overdue');
    expect(texts('app-task-row .meta')[0]).toBe('In Progress Critical CHK-142');
    expect(row.querySelector('.project')?.textContent?.trim()).toBe('Checkout');
  });

  it('links a row to task detail within the tab', async () => {
    await create();
    await settle();

    const item = element().querySelector('app-task-row ion-item');
    expect(item?.getAttribute('href')).toBe('/tasks/p1/1');
  });

  it('lists every open assigned task under All assigned', async () => {
    await create();
    await settle();
    await selectSegment('assigned');

    expect(element().querySelector('ion-item-divider')).toBeNull();
    expect(texts('app-task-row .key')).toEqual([
      'CHK-142',
      'BIL-88',
      'CHK-150',
      'BIL-90',
      'CHK-131',
    ]);
  });

  it('loads watched tasks only once Watching is opened', async () => {
    await create();
    const listMyTasks = vi.spyOn(api, 'listMyTasks');
    await settle();
    expect(listMyTasks).not.toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'watching' })
    );

    await selectSegment('watching');
    await settle();

    expect(listMyTasks).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'watching' })
    );
    expect(texts('app-task-row .key')).toEqual(['BIL-75']);
  });

  it('reloads on pull-to-refresh and completes the refresher once loaded', async () => {
    await create();
    await settle();
    const listMyTasks = vi.spyOn(api, 'listMyTasks');
    const refresher = element().querySelector('ion-refresher')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(refresher, { complete });

    refresher.dispatchEvent(new CustomEvent('ionRefresh'));
    expect(complete).not.toHaveBeenCalled();
    await settle();

    // Focus, plus All assigned for the subtitle's count.
    expect(listMyTasks).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(texts('ion-item-divider')[0]).toBe('Overdue · 1');
  });

  it('shows skeleton rows while the first load is pending', async () => {
    const pending: FluxApi = {
      ...new InMemoryFluxApi(),
      listMyTasks: () => new Promise(() => undefined),
    } as FluxApi;
    await create(pending);

    expect(element().querySelector('app-skeleton-rows')).not.toBeNull();
    expect(element().querySelector('app-task-row')).toBeNull();
  });

  it('shows an empty state when nothing is due soon', async () => {
    const empty = new InMemoryFluxApi();
    vi.spyOn(empty, 'listMyTasks').mockResolvedValue({
      content: [],
      totalElements: 0,
    });
    await create(empty);
    await settle();

    expect(texts('app-empty-state p')).toEqual([
      'Nothing due in the next 7 days.',
    ]);
  });

  it('shows an error state whose Retry loads again', async () => {
    const failing = new InMemoryFluxApi();
    const listMyTasks = vi
      .spyOn(failing, 'listMyTasks')
      .mockRejectedValue(new ApiError(0));
    await create(failing);
    await settle();

    expect(texts('app-error-state p')[0]).toContain("Couldn't reach Flux");
    expect(texts('.subtitle')[0]).not.toContain('assigned');

    listMyTasks.mockRestore();
    element().querySelector<HTMLElement>('app-error-state ion-button')!.click();
    await settle();

    expect(element().querySelector('app-error-state')).toBeNull();
    expect(texts('ion-item-divider')[0]).toBe('Overdue · 1');
    // The subtitle's count failed too, so Retry reloads it as well.
    expect(texts('.subtitle')[0]).toMatch(/· 5 assigned$/);
  });
});
