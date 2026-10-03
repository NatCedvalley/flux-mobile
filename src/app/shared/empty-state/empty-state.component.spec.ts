import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

@Component({
  imports: [EmptyStateComponent],
  template: `<app-empty-state
    icon="inbox"
    message="You're all caught up"
  >
    <button>Refresh</button>
  </app-empty-state>`,
})
class HostComponent {}

describe('EmptyStateComponent', () => {
  it('shows the icon, the sentence and the projected action', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(iconName(el.querySelector('ion-icon'))).toBe('inbox');
    expect(el.querySelector('p')?.textContent).toBe("You're all caught up");
    expect(el.querySelector('button')?.textContent).toBe('Refresh');
  });
});
