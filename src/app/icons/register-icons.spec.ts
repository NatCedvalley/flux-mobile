import { addIcons } from 'ionicons';
import icons from './lucide-icons.json';
import { registerFluxIcons } from './register-icons';

vi.mock('ionicons', () => ({ addIcons: vi.fn() }));

describe('registerFluxIcons', () => {
  it('registers every handoff icon as an unencoded SVG data URL', () => {
    registerFluxIcons();

    const registered = vi.mocked(addIcons).mock.calls[0][0] as Record<
      string,
      string
    >;
    expect(Object.keys(registered)).toEqual(Object.keys(icons));
    // ionicons parses the markup straight out of the URL, so it must not be
    // URI-encoded, or every icon renders blank.
    const bell = registered['bell'];
    expect(bell.startsWith('data:image/svg+xml;utf8,<svg ')).toBe(true);
    expect(bell).toContain((icons as Record<string, string>)['bell']);
    expect(bell).toContain('fill="none"');
    expect(bell).toContain('stroke="currentColor"');
  });
});
