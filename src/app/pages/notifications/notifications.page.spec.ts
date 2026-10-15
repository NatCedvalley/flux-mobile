import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController, ToastController } from '@ionic/angular';
import type { AppNotification, Page } from '@core/api';
import { ApiError } from '@core/auth';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { InboxService } from '../../inbox/inbox.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { PushService } from '../../push/push.service';
import { NotificationsPage } from './notifications.page';

/** 2 pm local, so the fixtures' "hours ago" stay on today. */
const NOW = new Date(2026, 9, 15, 14, 0);

/** A toast whose `onDidDismiss` resolves when it's dismissed. */
function fakeToast() {
  let dismissed: () => void = () => undefined;
  const didDismiss = new Promise<void>((resolve) => (dismissed = resolve));
  return {
    present: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(() => {
      dismissed();
      return Promise.resolve(true);
    }),
    onDidDismiss: () => didDismiss,
  };
}

/** `count` unread assignments, newest first, paged like the server. */
function manyNotifications(count: number) {
  const rows: AppNotification[] = Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    type: 'ASSIGNMENT',
    message: `Ben Tan assigned you to: Task ${i}`,
    isRead: true,
    createdAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
  }));
  return ({ page = 0, size = 30 }: { page?: number; size?: number } = {}) =>
    Promise.resolve<Page<AppNotification>>({
      content: rows.slice(page * size, (page + 1) * size),
      totalElements: rows.length,
      last: (page + 1) * size >= rows.length,
    });
}

describe('NotificationsPage', () => {
  let fixture: ComponentFixture<NotificationsPage>;
  let api: InMemoryFluxApi;
  let showCard: ReturnType<typeof signal<boolean>>;
  let toasts: ReturnType<typeof fakeToast>[];
  let toast: { create: ReturnType<typeof vi.fn> };
  let nav: { navigateForward: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  async function create(
    arrange: (api: InMemoryFluxApi) => void = () => undefined,
    load = true
  ) {
    api = new InMemoryFluxApi(NOW);
    arrange(api);
    showCard = signal(false);
    toasts = [];
    toast = {
      create: vi.fn(() => {
        const t = fakeToast();
        toasts.push(t);
        return Promise.resolve(t);
      }),
    };
    nav = { navigateForward: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useValue: api },
        { provide: PushService, useValue: { showCard } },
        { provide: ToastController, useValue: toast },
        { provide: NavController, useValue: nav },
        {
          provide: AuthService,
          useValue: {
            account: signal({ id: 'a1' }),
            restore: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    // At startup, InboxService's initializer loads the counts.
    await TestBed.inject(InboxService).refresh();
    fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    if (load) {
      await settle();
    }
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  }

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texts(selector: string, root: ParentNode = element()): string[] {
    return Array.from(root.querySelectorAll(selector)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  /** Each row's key, or its lead when it has none. */
  function rowIds(): string[] {
    return Array.from(element().querySelectorAll('app-notification-row')).map(
      (r) =>
        r.querySelector('.key')?.textContent?.trim() ??
        r.querySelector('.lead')?.textContent?.trim() ??
        ''
    );
  }

  /** The sliding row whose subject is `subject`. */
  function sliding(subject: string): HTMLIonItemSlidingElement {
    return Array.from(
      element().querySelectorAll<HTMLIonItemSlidingElement>('ion-item-sliding')
    ).find((s) => s.querySelector('.subject')?.textContent === subject)!;
  }

  function row(subject: string): HTMLElement {
    return sliding(subject).querySelector('app-notification-row ion-item')!;
  }

  function option(subject: string, kind: 'read' | 'mute') {
    return sliding(subject).querySelector<HTMLElement>(
      `ion-item-option.${kind}`
    );
  }

  function isUnread(subject: string): boolean {
    return row(subject).classList.contains('unread');
  }

  async function selectSegment(value: string): Promise<void> {
    const segment = element().querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    await settle();
  }

  const subtitle = () => texts('.subtitle')[0];
  const toastMessages = () =>
    toast.create.mock.calls.map(([options]) => options.message);
  const undoToast = () =>
    toast.create.mock.calls
      .map(([options], i) => ({ options, toast: toasts[i] }))
      .filter(({ options }) => options.buttons?.[0]?.text === 'Undo')
      .at(-1)!;

  const MENTION = 'Fix 3DS redirect on Safari';
  const COMMENT = 'Speed up the order summary query';
  const RELEASE = 'v2.4.0';

  it('heads the screen with the counts and Mark all read', async () => {
    await create();

    expect(element().querySelector('h1')?.textContent).toBe('Inbox');
    expect(subtitle()).toBe('4 unread · 1 mention');
    expect(texts('.mark-all')).toEqual(['Mark all read']);
    expect(
      (element().querySelector('.mark-all') as { disabled?: boolean }).disabled
    ).toBe(false);
  });

  it('shows All, Mentions with its count, and Assigned', async () => {
    await create();

    expect(texts('ion-segment-button')).toEqual([
      'All',
      'Mentions 1',
      'Assigned',
    ]);
    expect(texts('ion-segment-button .count')).toEqual(['1']);
  });

  it('groups All into Today and Earlier, in the server’s order', async () => {
    const list = vi.spyOn(InMemoryFluxApi.prototype, 'listNotifications');
    await create();

    expect(list).toHaveBeenCalledWith({ type: undefined, page: 0, size: 30 });
    expect(texts('ion-item-divider')).toEqual(['Today', 'Earlier']);
    const [today, earlier] = Array.from(
      element().querySelectorAll('ion-item-group')
    );
    expect(texts('.subject', today)).toEqual([
      MENTION,
      'Review pull request #482',
      MENTION,
    ]);
    expect(texts('.subject', earlier)).toHaveLength(6);
    list.mockRestore();
  });

  it('shows the actor, verb, age, subject, key and project', async () => {
    await create();
    const first = element().querySelector('app-notification-row')!;

    expect(texts('.lead', first)).toEqual(['Ben Tan']);
    expect(texts('.verb', first)).toEqual(['mentioned you in']);
    expect(texts('.age', first)).toEqual(['5m']);
    expect(texts('.subject', first)).toEqual([MENTION]);
    expect(texts('.key', first)).toEqual(['CHK-142']);
    expect(texts('.project', first)).toEqual(['Checkout']);
    expect(texts('.avatar', first)).toEqual(['BT']);
    expect(first.querySelector('ion-item')!.classList).toContain('unread');
  });

  it('leads with a glyph for state changes, and marks only unread rows', async () => {
    await create();

    const assignment = row('Review pull request #482');
    expect(assignment.querySelector('.glyph')?.getAttribute('data-tone')).toBe(
      'amber'
    );
    const release = row(RELEASE);
    expect(release.querySelector('.glyph')?.getAttribute('data-tone')).toBe(
      'violet'
    );
    expect(release.querySelector('.key')).toBeNull();
    expect(isUnread(RELEASE)).toBe(true);
    expect(isUnread('Migrate saved cards')).toBe(false);
  });

  it('loads Mentions and Assigned by type the first time they open', async () => {
    await create();
    const list = vi.spyOn(api, 'listNotifications');

    await selectSegment('mentions');
    expect(list).toHaveBeenLastCalledWith({
      type: 'MENTION,DESCRIPTION_MENTION',
      page: 0,
      size: 30,
    });
    expect(texts('.subject')).toEqual([MENTION, 'Migrate saved cards']);

    await selectSegment('assigned');
    expect(list).toHaveBeenLastCalledWith({
      type: 'ASSIGNMENT',
      page: 0,
      size: 30,
    });
    expect(rowIds()).toEqual(['CHK-150', 'Ben Tan assigned you to']);

    await selectSegment('mentions');
    expect(list).toHaveBeenCalledTimes(2);
  });

  describe('tap', () => {
    it('marks the row read and opens its task on this tab', async () => {
      await create();

      row(MENTION).click();
      await settle();

      expect(nav.navigateForward).toHaveBeenCalledWith(['tasks', 'p1', '1'], {
        relativeTo: TestBed.inject(ActivatedRoute),
      });
      expect(isUnread(MENTION)).toBe(false);
      expect(subtitle()).toBe('3 unread · 0 mentions');
      expect(
        (await api.listNotifications({ isRead: false })).content?.map(
          (n) => n.id
        )
      ).toEqual(['n2', 'n4', 'n7']);
    });

    it('only marks a release row read', async () => {
      await create();

      row(RELEASE).click();
      await settle();

      expect(nav.navigateForward).not.toHaveBeenCalled();
      expect(isUnread(RELEASE)).toBe(false);
      expect(subtitle()).toBe('3 unread · 1 mention');
    });

    it('opens a read row without writing', async () => {
      await create();
      const mark = vi.spyOn(api, 'markNotificationRead');

      row('Migrate saved cards').click();
      await settle();

      expect(mark).not.toHaveBeenCalled();
      expect(nav.navigateForward).toHaveBeenCalledWith(
        ['tasks', 'p1', '6'],
        expect.anything()
      );
    });

    it('puts the row back with the server’s message when refused', async () => {
      await create();
      vi.spyOn(api, 'markNotificationRead').mockRejectedValue(
        new ApiError(404, { message: 'Notification not found' })
      );

      row(COMMENT).click();
      await settle();

      expect(isUnread(COMMENT)).toBe(true);
      expect(subtitle()).toBe('4 unread · 1 mention');
      expect(toastMessages()).toContain('Notification not found');
    });
  });

  describe('swipe', () => {
    it('offers Mark read on unread rows and Mute on task rows', async () => {
      await create();

      expect(option(MENTION, 'read')?.getAttribute('expandable')).toBe('true');
      expect(option(MENTION, 'mute')?.textContent?.trim()).toBe('Mute');
      expect(option(RELEASE, 'read')).not.toBeNull();
      expect(option(RELEASE, 'mute')).toBeNull();
      expect(option('Migrate saved cards', 'read')).toBeNull();
      // A read row with no task has nothing to swipe to.
      expect(sliding('Old checkout banner').disabled).toBe(true);
      expect(sliding(MENTION).disabled).toBe(false);
    });

    it('marks read at once, but writes only once Undo has gone', async () => {
      await create();
      const mark = vi.spyOn(api, 'markNotificationRead');

      option(COMMENT, 'read')!.click();
      await settle();

      expect(isUnread(COMMENT)).toBe(false);
      expect(subtitle()).toBe('3 unread · 1 mention');
      expect(undoToast().options).toMatchObject({
        message: 'Marked read',
        duration: 4000,
        positionAnchor: 'tab-bar',
      });
      expect(mark).not.toHaveBeenCalled();

      await undoToast().toast.dismiss();
      await settle();

      expect(mark).toHaveBeenCalledWith('n4');
      expect(isUnread(COMMENT)).toBe(false);
    });

    it('marks read on a full swipe', async () => {
      await create();

      sliding(COMMENT)
        .querySelector('ion-item-options[side="end"]')!
        .dispatchEvent(new CustomEvent('ionSwipe'));
      await settle();

      expect(isUnread(COMMENT)).toBe(false);
    });

    it('puts the row back on Undo and never writes', async () => {
      await create();
      const mark = vi.spyOn(api, 'markNotificationRead');
      option(MENTION, 'read')!.click();
      await settle();
      expect(subtitle()).toBe('3 unread · 0 mentions');

      undoToast().options.buttons[0].handler();
      await undoToast().toast.dismiss();
      await settle();

      expect(isUnread(MENTION)).toBe(true);
      expect(subtitle()).toBe('4 unread · 1 mention');
      expect(mark).not.toHaveBeenCalled();
    });

    it('puts the row back with the server’s message when the write fails', async () => {
      await create();
      vi.spyOn(api, 'markNotificationRead').mockRejectedValue(
        new ApiError(404, { message: 'Notification not found' })
      );
      option(COMMENT, 'read')!.click();
      await settle();

      await undoToast().toast.dismiss();
      await settle();

      expect(isUnread(COMMENT)).toBe(true);
      expect(subtitle()).toBe('4 unread · 1 mention');
      expect(toastMessages()).toContain('Notification not found');
    });

    it('marks read in every segment the row is loaded in', async () => {
      await create();
      await selectSegment('mentions');

      option(MENTION, 'read')!.click();
      await settle();
      await selectSegment('all');

      expect(isUnread(MENTION)).toBe(false);
    });

    it('mutes the task', async () => {
      await create();
      const unsubscribe = vi.spyOn(api, 'unsubscribeFromTask');

      option(MENTION, 'mute')!.click();
      await settle();

      expect(unsubscribe).toHaveBeenCalledWith('p1', '1');
      expect(toastMessages()).toEqual(['Muted CHK-142']);
      expect(isUnread(MENTION)).toBe(true);
    });

    it('shows the server’s message when Mute fails', async () => {
      await create();
      vi.spyOn(api, 'unsubscribeFromTask').mockRejectedValue(
        new ApiError(403, { message: 'Not a member' })
      );

      option(MENTION, 'mute')!.click();
      await settle();

      expect(toastMessages()).toEqual(['Not a member']);
    });
  });

  describe('Mark all read', () => {
    it('marks every row and the counts read at once', async () => {
      await create();

      element().querySelector<HTMLElement>('.mark-all')!.click();
      fixture.detectChanges();

      expect(element().querySelectorAll('ion-item.unread')).toHaveLength(0);
      expect(subtitle()).toBe('0 unread · 0 mentions');
      await settle();
      expect(
        (await api.listNotifications({ isRead: false })).content
      ).toHaveLength(0);
      expect(
        (element().querySelector('.mark-all') as { disabled?: boolean })
          .disabled
      ).toBe(true);
      expect(texts('ion-segment-button .count')).toEqual([]);
    });

    it('puts everything back with the server’s message when refused', async () => {
      await create();
      vi.spyOn(api, 'markAllNotificationsRead').mockRejectedValue(
        new ApiError(500, { message: 'Try again later' })
      );

      element().querySelector<HTMLElement>('.mark-all')!.click();
      await settle();

      expect(element().querySelectorAll('ion-item.unread')).toHaveLength(4);
      expect(subtitle()).toBe('4 unread · 1 mention');
      expect(toastMessages()).toEqual(['Try again later']);
    });
  });

  it('reloads on pull-to-refresh and completes the refresher once loaded', async () => {
    await create();
    const list = vi.spyOn(api, 'listNotifications');
    const count = vi.spyOn(api, 'notificationUnreadCount');
    const refresher = element().querySelector('ion-refresher')!;
    const complete = vi.fn().mockResolvedValue(undefined);
    Object.assign(refresher, { complete });

    refresher.dispatchEvent(new CustomEvent('ionRefresh'));
    expect(complete).not.toHaveBeenCalled();
    expect(element().querySelectorAll('app-notification-row')).toHaveLength(9);
    await settle();

    expect(list).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('pages as you scroll, with Retry when a page fails, then the hint', async () => {
    await create((api) =>
      vi
        .spyOn(api, 'listNotifications')
        .mockImplementation(manyNotifications(40))
    );
    expect(element().querySelectorAll('app-notification-row')).toHaveLength(30);
    expect(element().querySelector('.hint')).toBeNull();

    const more = vi.mocked(api.listNotifications);
    more.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const infinite = element().querySelector('ion-infinite-scroll')!;
    Object.assign(infinite, { complete: vi.fn().mockResolvedValue(undefined) });
    infinite.dispatchEvent(new CustomEvent('ionInfinite'));
    await settle();

    expect(texts('.load-more-error span')).toEqual([
      "Couldn't load more notifications.",
    ]);

    element()
      .querySelector<HTMLElement>('.load-more-error ion-button')!
      .click();
    await settle();

    expect(more).toHaveBeenLastCalledWith({
      type: undefined,
      page: 1,
      size: 30,
    });
    expect(element().querySelectorAll('app-notification-row')).toHaveLength(40);
    expect(texts('.hint')).toEqual([
      'Swipe a notification to mark read or mute the task',
    ]);
  });

  it('shows skeleton rows while the first load is pending', async () => {
    await create(
      (api) =>
        vi
          .spyOn(api, 'listNotifications')
          .mockReturnValue(new Promise(() => undefined)),
      false
    );
    fixture.detectChanges();

    expect(element().querySelector('app-skeleton-rows')).not.toBeNull();
  });

  it('shows the error state, and Retry loads again', async () => {
    await create((api) =>
      vi
        .spyOn(api, 'listNotifications')
        .mockRejectedValueOnce(new ApiError(0, {}))
    );

    expect(element().querySelector('app-error-state')).not.toBeNull();

    element().querySelector<HTMLElement>('app-error-state ion-button')!.click();
    await settle();

    expect(element().querySelector('app-error-state')).toBeNull();
    expect(element().querySelectorAll('app-notification-row')).toHaveLength(9);
  });

  it('says you’re all caught up when there’s nothing', async () => {
    await create((api) =>
      vi
        .spyOn(api, 'listNotifications')
        .mockImplementation(manyNotifications(0))
    );

    expect(texts('app-empty-state p')).toEqual(["You're all caught up"]);
  });

  it('shows the push card only while push asks for it', async () => {
    await create();
    expect(element().querySelector('app-push-card')).toBeNull();

    showCard.set(true);
    fixture.detectChanges();

    expect(element().querySelector('app-push-card')).not.toBeNull();
  });
});
