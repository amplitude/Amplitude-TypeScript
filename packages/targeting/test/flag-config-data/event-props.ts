import { TargetingFlag } from '../../src/typings/targeting';

export const flagEventProps: TargetingFlag = {
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
            selector: ['context', 'event', 'event_properties', '[Amplitude] Page URL'],
            op: 'is',
            values: ['http://localhost:3000/tasks-app'],
          },
        ],
      ],
    },
  ],
};
