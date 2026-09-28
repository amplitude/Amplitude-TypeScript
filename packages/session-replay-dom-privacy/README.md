# Session Replay DOM privacy

Shared privacy schema, DOM policy evaluation, URL matching, validation and rrweb
privacy options for browser replay and native WebView recorders. This package has
no recorder, analytics, transport, storage or remote-config client dependency.

```ts
import { parsePrivacyConfig, createPrivacyRecorderOptions } from '@amplitude/session-replay-dom-privacy';

const fragment = document.createDocumentFragment();
const policy = parsePrivacyConfig(remotePolicy, selector => { fragment.querySelector(selector); });
const options = createPrivacyRecorderOptions(policy, () => location.href);
// record({ ...options, emit });
```

`parsePrivacyConfig` rejects malformed known fields and invalid selectors. Unknown
fields are ignored for forward compatibility. On validation failure, the host must
not start recording. Missing remote configuration is a host lifecycle decision;
passing an empty policy explicitly selects the default medium mask level.

`data-amp-block`, `data-amp-mask`, and `data-amp-unmask` always work alongside
`amp-block`, `amp-mask`, and `amp-unmask` classes. Attribute presence is what
matters, including a value of `false`. Explicit masking on an element or ancestor wins over unmasking.
Blocking excludes the subtree regardless of unmasking annotations.

The host resolves local/remote precedence, observes navigation and owns recorder
lifecycle. Supply the current URL to callbacks. On policy replacement, stop the
old recorder and start a new one with a fresh baseline before accepting events;
already emitted content cannot be retroactively redacted. This package does not
implement native bridges or recorder lifecycle.

Browser retains its legacy invalid-selector warning/drop behavior using
`validatePrivacySelectors` with an explicit error callback. New remote-only
consumers should use the strict parser.
