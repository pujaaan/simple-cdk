import { RemovalPolicy } from 'aws-cdk-lib';
import { aws_dynamodb as ddb } from 'aws-cdk-lib';
import type { RegisterContext } from '@simple-cdk/core';
import type {
  AttrType,
  DynamoDbAdapterOptions,
  DynamoDbResource,
  GsiConfig,
  KeyDef,
  StreamMode,
} from './types.js';

export function registerTables(ctx: RegisterContext, opts: DynamoDbAdapterOptions): void {
  const stackName = opts.stackName ?? 'data';
  const removal = removalPolicyFromStage(ctx.config.stageConfig.removalPolicy);

  for (const resource of ctx.resources as DynamoDbResource[]) {
    const cfg = resource.config.modelConfig;
    const stack = cfg.stack
      ? ctx.stack(cfg.stack)
      : opts.stack ?? ctx.stack(stackName, opts.stackId ? { id: opts.stackId } : undefined);
    const id = cfg.constructId ?? pascal(resource.name) + 'Table';

    const streamMode: StreamMode | undefined =
      cfg.stream ?? (cfg.streamTargets && cfg.streamTargets.length > 0 ? 'NEW_AND_OLD_IMAGES' : undefined);

    const table = new ddb.Table(stack, id, {
      tableName: `${ctx.config.app}-${ctx.config.stage}-${resource.name}`,
      partitionKey: toAttribute(cfg.pk),
      sortKey: cfg.sk ? toAttribute(cfg.sk) : undefined,
      billingMode:
        cfg.billingMode === 'PROVISIONED' ? ddb.BillingMode.PROVISIONED : ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: cfg.pointInTimeRecovery ?? true,
      },
      stream: toStreamView(streamMode),
      timeToLiveAttribute: cfg.ttlAttribute,
      removalPolicy: removal,
    });

    for (const gsi of cfg.gsis ?? []) {
      table.addGlobalSecondaryIndex(toGsiProps(gsi));
    }

    resource.config.construct = table;
  }
}

function toAttribute(key: KeyDef): ddb.Attribute {
  return { name: key.name, type: toAttrType(key.type ?? 'string') };
}

function toAttrType(t: AttrType): ddb.AttributeType {
  switch (t) {
    case 'number':
      return ddb.AttributeType.NUMBER;
    case 'binary':
      return ddb.AttributeType.BINARY;
    case 'string':
    default:
      return ddb.AttributeType.STRING;
  }
}

function toStreamView(mode: StreamMode | undefined): ddb.StreamViewType | undefined {
  if (!mode) return undefined;
  return {
    KEYS_ONLY: ddb.StreamViewType.KEYS_ONLY,
    NEW_IMAGE: ddb.StreamViewType.NEW_IMAGE,
    OLD_IMAGE: ddb.StreamViewType.OLD_IMAGE,
    NEW_AND_OLD_IMAGES: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
  }[mode];
}

function toGsiProps(gsi: GsiConfig): ddb.GlobalSecondaryIndexProps {
  const projection = gsi.projection ?? 'ALL';
  let projectionType: ddb.ProjectionType;
  let nonKeyAttributes: string[] | undefined;
  if (typeof projection === 'string') {
    projectionType = projection === 'KEYS_ONLY' ? ddb.ProjectionType.KEYS_ONLY : ddb.ProjectionType.ALL;
  } else {
    projectionType = ddb.ProjectionType.INCLUDE;
    nonKeyAttributes = projection.include;
  }
  return {
    indexName: gsi.name,
    partitionKey: toAttribute(gsi.pk),
    sortKey: gsi.sk ? toAttribute(gsi.sk) : undefined,
    projectionType,
    nonKeyAttributes,
  };
}

function removalPolicyFromStage(value: string | undefined): RemovalPolicy | undefined {
  switch (value) {
    case 'destroy':
      return RemovalPolicy.DESTROY;
    case 'retain':
      return RemovalPolicy.RETAIN;
    case 'snapshot':
      return RemovalPolicy.SNAPSHOT;
    default:
      return undefined;
  }
}

function pascal(s: string): string {
  return s
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join('');
}
