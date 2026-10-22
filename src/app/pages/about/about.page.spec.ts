import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { buildInfo } from '../../../environments/build-info';
import { environment } from '../../../environments/environment';
import { AboutPage } from './about.page';

const app = vi.hoisted(() => ({ getInfo: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: app }));
const browser = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));

describe('AboutPage', () => {
  beforeEach(() => {
    app.getInfo.mockReset().mockResolvedValue({
      name: 'Flux',
      id: 'asia.justflux.mobile',
      version: '0.0.1 (42)',
      build: '42',
    });
    browser.open.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [provideRouter([])],
    });
  });

  async function render(native: boolean): Promise<HTMLElement> {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(native);
    const fixture = TestBed.createComponent(AboutPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function item(element: HTMLElement, label: string): HTMLElement | undefined {
    return Array.from(element.querySelectorAll('ion-item')).find((el) =>
      el.querySelector('ion-label')?.textContent?.includes(label)
    );
  }

  it('shows the version, commit and environment', async () => {
    const element = await render(false);

    expect(item(element, 'Version')?.textContent).toContain(buildInfo.version);
    expect(item(element, 'Commit')?.textContent).toContain(buildInfo.commit);
    expect(item(element, 'Environment')?.textContent).toContain(
      environment.name
    );
  });

  it('shows the native build number', async () => {
    const element = await render(true);

    expect(item(element, 'Build')?.textContent).toContain('42');
  });

  it('has no build row on web', async () => {
    const element = await render(false);

    expect(item(element, 'Build')).toBeUndefined();
    expect(app.getInfo).not.toHaveBeenCalled();
  });

  it('opens the privacy policy in the in-app browser on native', async () => {
    const element = await render(true);

    item(element, 'Privacy policy')?.click();

    expect(browser.open).toHaveBeenCalledWith({
      url: environment.privacyPolicyUrl,
    });
  });

  it('opens the privacy policy in a new tab on web', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const element = await render(false);

    item(element, 'Privacy policy')?.click();

    expect(open).toHaveBeenCalledWith(
      environment.privacyPolicyUrl,
      '_blank',
      'noopener'
    );
    expect(browser.open).not.toHaveBeenCalled();
  });
});
