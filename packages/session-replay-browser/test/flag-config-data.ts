export const flagConfig = {
  key: 'sr_targeting_config',
  variants: {
    on: { key: 'on' },
    off: { key: 'off' },
  },
  segments: [
    {
      metadata: { segmentName: 'sign in trigger' },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'xdfrewd', // Different salt for each bucket to allow for fallthrough
        allocations: [
          {
            range: [0, 19], // Selects 20% of users that match these conditions
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
      ],
    },
    {
      metadata: { segmentName: 'user property' },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'Rpr5h4vy', // Different salt for each bucket to allow for fallthrough
        allocations: [
          {
            range: [0, 14], // Selects 15% of users that match these conditions
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
            selector: ['context', 'user', 'user_properties', 'country'],
            op: 'set contains any',
            values: ['united states'],
          },
        ],
      ],
    },
    {
      metadata: { segmentName: 'leftover allocation' },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'T5lhyRo', // Different salt for each bucket to allow for fallthrough
        allocations: [
          {
            range: [0, 9], // Selects 10% of users that match these conditions
            distributions: [
              {
                variant: 'on',
                range: [0, 42949673],
              },
            ],
          },
        ],
      },
    },
    {
      variant: 'off',
    },
  ],
};
