import type { GroupHue } from '@core/project-list';
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

/** A group hue's dot (9), word (11) and wash. */
const GROUP_HUE_COLORS: Record<
  GroupHue,
  [dot: string, text: string, wash: string]
> = {
  gray: ['n8', 'na11', 'na2'],
  blue: ['blue9', 'blue11', 'bluea3'],
  amber: ['amber9', 'amber11', 'ambera2'],
  green: ['green9', 'green11', 'greena2'],
  purple: ['purple9', 'purple11', 'purplea3'],
  cyan: ['cyan9', 'cyan11', 'cyana3'],
  red: ['red9', 'red11', 'reda3'],
};

/** A group header's colours, as `--group-dot`, `--group-text` and `--group-wash`. */
export function groupHueColors(hue: GroupHue): Record<string, string> {
  const [dot, text, wash] = GROUP_HUE_COLORS[hue];
  return {
    '--group-dot': `var(--flux-${dot})`,
    '--group-text': `var(--flux-${text})`,
    '--group-wash': `var(--flux-${wash})`,
  };
}

/** A group hue's dot colour alone, for a status chip. */
export function groupHueDot(hue: GroupHue): string {
  return `var(--flux-${GROUP_HUE_COLORS[hue][0]})`;
}
