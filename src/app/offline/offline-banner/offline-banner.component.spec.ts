import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonIcon } from '@ionic/angular';
import { ApiError } from '@core/auth';
import { MemoryCacheStore } from '@core/offline';
import { WRITE_QUEUE_STORE } from '../../providers/write-queue-store.token';
import { ConnectivityService } from '../connectivity.service';
import { WriteQueueService } from '../write-queue.service';
import { OfflineBannerComponent } from './offline-banner.component';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('OfflineBannerComponent', () => {
  let online: ReturnType<typeof signal<boolean>>;
  let writeQueue: WriteQueueService;
  let fixture: ComponentFixture<OfflineBannerComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    online = signal(true);
    TestBed.configureTestingModule({
      imports: [OfflineBannerComponent],
      providers: [
        { provide: ConnectivityService, useValue: { online } },
        { provide: WRITE_QUEUE_STORE, useValue: new MemoryCacheStore() },
      ],
    });
    // A plain ion-modal element: presenting Ionic's in jsdom loops on focus.
    // The sheet has its own spec.
    TestBed.overrideComponent(OfflineBannerComponent, {
      set: { imports: [IonIcon], schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    writeQueue = TestBed.inject(WriteQueueService);
    await writeQueue.queue.load('a1');
    fixture = TestBed.createComponent(OfflineBannerComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function setOnline(value: boolean): void {
    online.set(value);
    fixture.detectChanges();
  }

  function queueStatus(taskId = '1'): Promise<boolean> {
    return writeQueue.enqueueStatus({
      projectId: 'p1',
      taskId,
      taskKey: 'CHK-142',
      from: { slug: 'in_progress' },
      to: { slug: 'todo', name: 'To Do' },
    });
  }

  /** Replays the queue against a server where every task is done. */
  async function conflictAll(): Promise<void> {
    await writeQueue.queue.replay({
      getTask: (_p, id) => Promise.resolve({ id, status: 'done' }),
      changeTaskStatus: vi.fn(),
      listTaskComments: vi.fn(),
      addTaskComment: () => Promise.reject(new ApiError(403)),
    });
    fixture.detectChanges();
  }

  const modal = () =>
    el.querySelector('ion-modal') as (Element & { isOpen?: boolean }) | null;

  it('shows nothing while online, but keeps the sheet ready', () => {
    expect(el.querySelector('.banner')).toBeNull();
    // Outside the band, so the band going doesn't take an open sheet.
    expect(modal()?.isOpen).toBe(false);
  });

  it('says it is offline, as a live region', () => {
    setOnline(false);

    const banner = el.querySelector('.banner');
    expect(el.getAttribute('role')).toBe('status');
    expect(banner?.tagName).toBe('DIV');
    expect(banner?.textContent?.trim()).toBe('Offline · showing cached work');
    expect(iconName(banner?.querySelector('ion-icon'))).toBe('cloud-off');
  });

  it('clears when the connection comes back', () => {
    setOnline(false);
    setOnline(true);

    expect(el.querySelector('.banner')).toBeNull();
  });

  it('counts the changes waiting offline, and opens them', async () => {
    await queueStatus('1');
    setOnline(false);
    expect(el.querySelector('.banner')?.textContent?.trim()).toBe(
      'Offline · 1 change waiting'
    );
    await queueStatus('2');
    fixture.detectChanges();

    const banner = el.querySelector<HTMLButtonElement>('button.banner');
    expect(banner?.textContent?.trim()).toBe('Offline · 2 changes waiting');
    banner?.click();
    fixture.detectChanges();
    expect(modal()?.isOpen).toBe(true);
  });

  it('stays online while changes need attention', async () => {
    await queueStatus('1');
    fixture.detectChanges();
    expect(el.querySelector('.banner')).toBeNull();

    await conflictAll();
    const banner = el.querySelector('button.banner');
    expect(banner?.textContent?.trim()).toBe('1 change needs attention');
    expect(iconName(banner?.querySelector('ion-icon'))).toBe('info');

    await queueStatus('2');
    await conflictAll();
    expect(el.querySelector('.banner')?.textContent?.trim()).toBe(
      '2 changes need attention'
    );
  });
});
