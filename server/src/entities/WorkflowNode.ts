import { required } from './utils.js';
import { EntityError } from '../lib/errors.js';
import { STATUSES, type StatusId } from '../lib/constants.js';

export interface WorkflowNodeRow {
  id: string;
  workflowId: string;
  statusId: StatusId;
  x: number;
  y: number;
  isInitial: boolean;
  isTerminal: boolean;
}

const ENTITY = 'WorkflowNode';

export class WorkflowNode {
  readonly id: string;
  readonly workflowId: string;
  readonly statusId: StatusId;
  readonly x: number;
  readonly y: number;
  readonly isInitial: boolean;
  readonly isTerminal: boolean;

  constructor(row: WorkflowNodeRow) {
    required(row.id, ENTITY, 'id');
    required(row.workflowId, ENTITY, 'workflowId');
    required(row.statusId, ENTITY, 'statusId');

    if (!STATUSES.includes(row.statusId)) {
      throw new EntityError(
        `WorkflowNode.statusId '${row.statusId}' is not a valid status`,
        ENTITY,
        'statusId'
      );
    }

    this.id = row.id;
    this.workflowId = row.workflowId;
    this.statusId = row.statusId;
    this.x = row.x ?? 0;
    this.y = row.y ?? 0;
    this.isInitial = Boolean(row.isInitial);
    this.isTerminal = Boolean(row.isTerminal);
  }

  static fromRow(row: WorkflowNodeRow): WorkflowNode {
    return new WorkflowNode(row);
  }
}
