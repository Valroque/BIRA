import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape — see server/src/services/mentionableService.ts (MentionableHit).
// `slug` and `color` are present on team hits, omitted on user hits.
// `avatarUrl` is reserved for users (not populated by the BE today, but the
// shape is in the BE contract so we accept it without fail).
// ---------------------------------------------------------------------------

export interface RawMentionable {
  type: 'user' | 'team';
  id: string;
  label: string;
  sublabel: string;
  avatarUrl?: string;
  slug?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// FE entity — `MentionableHit` is the value the picker passes back to its
// caller. UUIDs are opaque ids; never rendered. The picker shows `label` and
// `sublabel`. Mention chips serialise as `@[type:id]`.
// ---------------------------------------------------------------------------

export interface MentionableHit {
  type: 'user' | 'team';
  /** Opaque uuid. Used only as the chip payload — never rendered. */
  id: string;
  label: string;
  sublabel: string;
  avatarUrl: string | null;
  /** Workspace-unique team slug. Only set when `type === 'team'`. */
  slug: string | null;
  /** Team token color. Only set when `type === 'team'`. */
  color: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptMentionable(raw: RawMentionable): MentionableHit {
  const id = requireField(raw.id, '', { entity: 'Mentionable', field: 'id' });
  const validatedType: 'user' | 'team' =
    raw.type === 'user' || raw.type === 'team' ? raw.type : 'user';
  const type = requireField<'user' | 'team'>(validatedType, 'user', {
    entity: 'Mentionable',
    field: 'type',
    id,
  });
  const label = requireField(raw.label, '', { entity: 'Mentionable', field: 'label', id });
  const sublabel = expectField(raw.sublabel, '', { entity: 'Mentionable', field: 'sublabel', id });

  return {
    type,
    id,
    label,
    sublabel,
    avatarUrl: raw.avatarUrl ?? null,
    slug: raw.slug ?? null,
    color: raw.color ?? null,
  };
}
