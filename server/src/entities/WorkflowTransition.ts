import { required } from './utils.js';

export interface WorkflowTransitionRow {
  id: string;
  workflowId: string;
  fromNodeId: string;
  toNodeId: string;
  label: string | null;
  dashed: boolean;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'WorkflowTransition';

export class WorkflowTransition {
  readonly id: string;
  readonly workflowId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly label: string | null;
  readonly dashed: boolean;

  constructor(row: WorkflowTransitionRow) {
    required(row.id, ENTITY, 'id');
    required(row.workflowId, ENTITY, 'workflowId');
    required(row.fromNodeId, ENTITY, 'fromNodeId');
    required(row.toNodeId, ENTITY, 'toNodeId');

    this.id = row.id;
    this.workflowId = row.workflowId;
    this.fromNodeId = row.fromNodeId;
    this.toNodeId = row.toNodeId;
    this.label = row.label ?? null;
    this.dashed = Boolean(row.dashed);
  }

  static fromRow(row: WorkflowTransitionRow): WorkflowTransition {
    return new WorkflowTransition(row);
  }
}
