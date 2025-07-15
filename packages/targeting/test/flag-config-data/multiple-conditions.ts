export const flagConfigMultipleConditions = {
  key: 'sr_targeting_config',
  variants: {
    on: { key: 'on' },
    off: { key: 'off' },
  },
  segments: [
    {
      metadata: { segmentName: 'multiple condition trigger' },
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
            selector: ['context', 'event', 'event_type'],
            op: 'is',
            values: ['Sign In'],
          },
        ],
        [
          {
            selector: ['context', 'user', 'user_properties', 'name'],
            op: 'is',
            values: ['Banana'],
          },
        ],
      ],
    },
    {
      variant: 'off',
    },
  ],
};
