import { TargetingFlag } from '../../src/typings/targeting';

export const flagUserProps: TargetingFlag = {
  key: 'sr_targeting_config',
  variants: {
    off: {
      key: 'off',
    },
    on: {
      key: 'on',
    },
  },
  segments: [
    {
      metadata: {
        segmentName: 'Segment 1',
        segmentId: 'uuid1',
      },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'sphIslYm',
        allocations: [
          {
            distributions: [
              {
                range: [0, 42949673],
                variant: 'on',
              },
            ],
            range: [0, 51],
          },
        ],
      },
      conditions: [
        [
          {
            op: 'contains',
            selector: ['context', 'user', 'user_properties', 'plan_id'],
            values: ['paid', 'free'],
          },
        ],
      ],
    },
  ],
};
