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
      ],
    },
    {
      metadata: { segmentName: 'user property' },
      bucket: {
        selector: ['context', 'session_id'],
        salt: 'Rpr5h4vy',
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
        salt: 'T5lhyRo',
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
