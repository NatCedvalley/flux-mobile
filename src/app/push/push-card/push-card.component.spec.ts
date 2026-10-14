import { TestBed } from '@angular/core/testing';
import { PushService } from '../push.service';
import { PushCardComponent } from './push-card.component';

describe('PushCardComponent', () => {
  let push: {
    enable: ReturnType<typeof vi.fn>;
    dismissCard: ReturnType<typeof vi.fn>;
  };
  let el: HTMLElement;

  beforeEach(() => {
    push = {
      enable: vi.fn().mockResolvedValue(undefined),
      dismissCard: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [PushCardComponent],
      providers: [{ provide: PushService, useValue: push }],
    });
    const fixture = TestBed.createComponent(PushCardComponent);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  it('says what will be sent', () => {
    expect(el.querySelector('h2')?.textContent).toBe(
      'Get notified on your phone'
    );
    expect(el.querySelector('p')?.textContent).toContain('assigned');
  });

  it('asks for permission only from its button', () => {
    expect(push.enable).not.toHaveBeenCalled();

    el.querySelector<HTMLElement>('.enable')?.click();

    expect(push.enable).toHaveBeenCalledTimes(1);
  });

  it('dismisses', () => {
    el.querySelector<HTMLElement>('.dismiss')?.click();

    expect(push.dismissCard).toHaveBeenCalledTimes(1);
    expect(push.enable).not.toHaveBeenCalled();
  });
});
