import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { AuthService } from '../../auth/auth.service';
import { FLUX_API } from '../../providers/flux-api.token';
import { MyWorkPage } from './my-work.page';

describe('MyWorkPage', () => {
  let fixture: ComponentFixture<MyWorkPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyWorkPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useClass: InMemoryFluxApi },
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
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the screen title', () => {
    expect(element().querySelector('h1')?.textContent).toBe('My Work');
  });

  it("shows the account's initials on an avatar that opens Settings", () => {
    const button = element().querySelector('.avatar-button');

    expect(button?.getAttribute('routerLink')).toBe('settings');
    expect(button?.querySelector('.avatar')?.textContent?.trim()).toBe('AR');
  });

  it('lists the fixture tasks, linking to detail within the tab', async () => {
    const tasks = await new InMemoryFluxApi().listTasks();

    await fixture.whenStable();
    fixture.detectChanges();

    const items = Array.from(element().querySelectorAll('ion-item'));
    expect(items.map((item) => item.querySelector('h2')?.textContent)).toEqual(
      tasks.map((task) => task.title)
    );
    expect(items[0].getAttribute('href')).toBe(
      `/tasks/${tasks[0].projectId}/${tasks[0].id}`
    );
  });
});
