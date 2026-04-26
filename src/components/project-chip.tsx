// Two project visuals — pick whichever matches the surrounding layout:
//
//   <ProjectBadge> — small letter square. Standalone visual, used when the
//     project name is shown beside it (project cards, picker rows, group
//     swatches inside a labeled group header).
//
//   <ProjectChip> — pill with a tiny dot + the project name. Inline element
//     used inside text/table cells (issue list project column, "used by"
//     links on the workflows page).
//
// Both pull `bg` / `color` / `letter` / `name` straight off the `Project`.
// Anywhere that renders `p.bg / p.color / p.letter` ad-hoc should use one
// of these; consistency in size + radius + typography lives in one place.

import type { CSSProperties, ReactNode } from 'react';
import type { Project } from '../fixtures';

interface ProjectBadgeProps {
  project: Project;
  /** Square side in px. Default 14. */
  size?: number;
  /**
   * Text size inside the square. Defaults are tuned per size; override only
   * when the surrounding density requires something specific.
   */
  fontSize?: number;
  /** Border-radius. Defaults to size/4 for a soft square. */
  radius?: number;
}

/** Letter square. The most common project visual at size 14 (group swatches,
 *  filter options) and 28-32 for cards. */
export function ProjectBadge({ project, size = 14, fontSize, radius }: ProjectBadgeProps) {
  // Tuned defaults — small badges look right at fontSize~10, larger ones at ~14.
  const fs = fontSize ?? Math.max(9, Math.round(size * 0.45));
  const r = radius ?? Math.max(2, Math.round(size / 4));
  return (
    <span
      title={project.name}
      style={{
        width: size, height: size, borderRadius: r,
        background: project.bg, color: project.color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: fs, fontFamily: 'var(--font-sans)',
        flexShrink: 0,
      }}
    >
      {project.letter}
    </span>
  );
}

interface ProjectChipProps {
  project: Project;
  /**
   * Override or extend the wrapping element. When provided, the chip renders
   * inside this slot — used by the workflows page to wrap each chip in a
   * <Link>. Default: a span.
   */
  as?: 'span';
  /** Extra style overrides (padding, fontSize) for tighter contexts. */
  style?: CSSProperties;
  /** Optional trailing content (e.g. an X to remove). */
  trailing?: ReactNode;
}

/** Pill with a tiny dot + the project name. */
export function ProjectChip({ project, style, trailing }: ProjectChipProps) {
  return (
    <span
      title={project.name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 18, padding: '0 6px', borderRadius: 3,
        background: project.bg, color: project.color,
        fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0,
        ...style,
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: 3,
        background: 'currentColor', flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</span>
      {trailing}
    </span>
  );
}
