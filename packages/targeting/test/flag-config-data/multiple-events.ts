import { TargetingFlag } from '../../src/typings/targeting';

export const flagConfigMultipleEvents: TargetingFlag = {
  key: 'sr_targeting_config',
  variants: {
    on: { key: 'on' },
    off: { key: 'off' },
  },
  segments: [
    {
      metadata: { segmentName: 'multiple event trigger' },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'xdfrewd',
        allocations: [
          {
            range: [0, 99],
            distributions: [
              {
                variant: 'on',
                range: [0, 42949673],
              },
            ],
          },
        ],
      },
      conditions: [
        [
          {
            selector: ['context', 'event_types'],
            op: 'set contains',
            values: ['Add to Cart', 'Sign In'],
          },
        ],
      ],
    },
    {
      variant: 'off',
    },
  ],
};
