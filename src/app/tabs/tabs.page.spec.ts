import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InboxService } from '../inbox/inbox.service';
import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;
  let unread: ReturnType<typeof signal<number | undefined>>;

  beforeEach(async () => {
    unread = signal<number | undefined>(undefined);
    await TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [
        provideRouter([]),
        { provide: InboxService, useValue: { unread } },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows My Work, Projects and Inbox, in that order', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-tab-button')
    );

    expect(
      buttons.map((b) => [
        b.getAttribute('tab'),
        b.getAttribute('href'),
        b.querySelector('ion-label')?.textContent?.trim(),
      ])
    ).toEqual([
      ['my-work', '/tabs/my-work', 'My Work'],
      ['projects', '/tabs/projects', 'Projects'],
      ['inbox', '/tabs/inbox', 'Inbox'],
    ]);
  });

  describe('Inbox badge', () => {
    function badge(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector(
        'ion-tab-button[tab="inbox"] ion-badge'
      );
    }

    it('shows the unread count in red', () => {
      unread.set(3);
      fixture.detectChanges();

      expect(badge()?.textContent?.trim()).toBe('3');
      expect(badge()?.getAttribute('color')).toBe('danger');
      expect(badge()?.getAttribute('aria-hidden')).toBe('true');
      expect(
        fixture.nativeElement.querySelector('.flux-sr-only')?.textContent
      ).toBe('3 unread');
    });

    it('caps the count at 99+', () => {
      unread.set(99);
      fixture.detectChanges();
      expect(badge()?.textContent?.trim()).toBe('99');

      unread.set(100);
      fixture.detectChanges();
      expect(badge()?.textContent?.trim()).toBe('99+');
    });

    it('is hidden at 0 and until the count loads', () => {
      expect(badge()).toBeNull();

      unread.set(0);
      fixture.detectChanges();
      expect(badge()).toBeNull();
    });
  });
});
