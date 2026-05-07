// Adapter between the BE `MilestoneView` shape and the FE `Milestone` entity.
//
// The FE shape is intentionally narrower than the wire shape — surface only
// the fields current consumers need. `workspaceId`, `createdAt`, and
// `updatedAt` come back from the BE but aren't rendered anywhere, so we
// drop them here. Adding them later is a forward-compatible expansion.

import type { Milestone } from '../../fixtures';
import { requireField } from '../lib/adapterContract';

export interface RawMilestone {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string | null;
  /** ISO YYYY-MM-DD. */
  date: string;
  createdAt: string;
  updatedAt: string | null;
}

export function adaptMilestone(raw: RawMilestone): Milestone {
  const id = requireField(raw.id, '', { entity: 'Milestone', field: 'id' });
  const projectId = requireField(raw.projectId, '', {
    entity: 'Milestone', field: 'projectId', id,
  });
  const name = requireField(raw.name, '', {
    entity: 'Milestone', field: 'name', id,
  });
  const date = requireField(raw.date, '', {
    entity: 'Milestone', field: 'date', id,
  });
  const m: Milestone = { id, projectId, name, date };
  if (raw.description) m.description = raw.description;
  return m;
}
