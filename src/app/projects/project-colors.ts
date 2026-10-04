import { type ProjectHue, projectHue } from '@core/my-work';

/** A hue's token prefix: indigo is `p` (`--flux-p9`, `--flux-pa3`). */
function prefix(hue: ProjectHue): string {
  return hue === 'indigo' ? 'p' : hue;
}

/** A project's tinted avatar, as in the 3b header: a3 fill, 11 text. */
export function projectTint(projectId: string): Record<string, string> {
  const hue = prefix(projectHue(projectId));
  return {
    '--project-fill': `var(--flux-${hue}a3)`,
    '--project-text': `var(--flux-${hue}11)`,
  };
}

/** A project's solid swatch, as in the 3j switcher: hue 9, white text. */
export function projectSwatch(projectId: string): Record<string, string> {
  return {
    '--project-fill': `var(--flux-${prefix(projectHue(projectId))}9)`,
    '--project-text': 'var(--flux-avatar-text)',
  };
}
