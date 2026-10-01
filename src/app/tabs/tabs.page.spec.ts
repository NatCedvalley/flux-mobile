import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [provideRouter([])],
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
});
