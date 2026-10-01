import icons from './lucide-icons.json';
import { fluxIconUrls } from './register-icons';

describe('fluxIconUrls', () => {
  it('covers every handoff icon as an unencoded SVG data URL', () => {
    const urls = fluxIconUrls();

    expect(Object.keys(urls)).toEqual(Object.keys(icons));
    // ionicons parses the markup straight out of the URL, so it must not be
    // URI-encoded, or every icon renders blank.
    const bell = urls['bell'];
    expect(bell.startsWith('data:image/svg+xml;utf8,<svg ')).toBe(true);
    expect(bell).toContain((icons as Record<string, string>)['bell']);
    expect(bell).toContain('fill="none"');
    expect(bell).toContain('stroke="currentColor"');
  });
});
