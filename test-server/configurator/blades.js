// The product offerings a client can be built for — "blades" internally, and the SDKs initAll() wires
// up in packages/unified. Each key is both the state key holding whether that blade is switched on and
// what gates its section of the form, so nothing is configured for a product that isn't in use.
//
// Analytics is `required` because the others are plugins on the analytics SDK and take their identity
// and session from it: there is no client here that doesn't init it. Its checkbox is shown so the set
// reads as the whole product line, but it can't be switched off, and nothing about it is held in the
// state the link carries.
export const BLADES = [
  {
    key: 'analytics',
    label: 'Analytics',
    required: true,
    description: 'Always on: the other blades are plugins on the analytics SDK and build on its identity and session.',
  },
  {
    key: 'sessionReplay',
    label: 'Session Replay',
    description: 'Installs the session replay plugin alongside the analytics SDK.',
  },
  {
    key: 'engagement',
    label: 'Guides and Surveys',
    description: 'Installs the Guides and Surveys plugin alongside the analytics SDK.',
  },
];
