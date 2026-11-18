# Guides & Surveys initialization

With Guides & Surveys enabled, the GTM wrapper registers G&S in Analytics' initialization queue on a fresh client. Startup events queued before initialization, or tracked while G&S setup is pending, reach G&S once setup succeeds. Slow or never-settling G&S setup delays fresh-client Analytics initialization; there is no timeout or event buffer.

On an already initialized client, Analytics resets its timeline before the wrapper reattaches G&S. Forwarding is guaranteed after wrapper Init resolves successfully. Events processed during reinitialization can miss G&S. A completed direct Analytics initialization is supported; overlapping direct Init calls bypass wrapper coordination and are outside this guarantee.

Overlapping wrapper Init calls for the same client share one operation through G&S attachment and failure cleanup. The first call's settings apply. G&S preparation or setup failure rejects wrapper Init after allowing Analytics initialization to complete; Analytics remains usable and a later wrapper Init can retry G&S. Failures inside Analytics initialization itself retain the SDK's existing behavior.

## Release validation

The embedded G&S proxy and deployed runtime must include the listener teardown fix from [assistance-browser PR #1449](https://github.com/amplitude/assistance-browser/pull/1449). Refresh the embedded proxy from the approved engagement-browser main build before marking the wrapper ready. Deploy the teardown fix before publishing this wrapper.

With that final runtime, validate in GTM Preview:

- An initial event-triggered guide appears, including when its event is queued before Init.
- A startup event completes a checklist.
- Guides and checklist completion still work after repeated History-triggered Init on SPA navigation.
- Analytics receives the test events once and G&S forwarding remains active.

Follow the maintainer publishing runbook to publish the wrapper, verify its CDN artifact, update the separate GTM template version pin, and repeat validation against the published integration. The wrapper lifecycle tests use a G&S double with the expected teardown contract; they do not establish cleanup in the shipped runtime.
