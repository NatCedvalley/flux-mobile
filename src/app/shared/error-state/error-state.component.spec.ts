import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError } from '@core/auth';
import { ErrorStateComponent } from './error-state.component';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

describe('ErrorStateComponent', () => {
  let fixture: ComponentFixture<ErrorStateComponent>;

  function render(error: unknown): HTMLElement {
    fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('error', error);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says the server could not be reached when there was no response', () => {
    const el = render(new ApiError(0));

    expect(el.querySelector('p')?.textContent).toContain("Couldn't reach Flux");
    expect(iconName(el.querySelector(':scope > ion-icon'))).toBe('cloud-off');
  });

  it('shows a generic message for any other failure', () => {
    const el = render(new ApiError(500));

    expect(el.querySelector('p')?.textContent).toContain(
      'Something went wrong'
    );
  });

  it('emits retry when Retry is tapped', () => {
    const el = render(new ApiError(0));
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    el.querySelector<HTMLElement>('ion-button')!.click();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
