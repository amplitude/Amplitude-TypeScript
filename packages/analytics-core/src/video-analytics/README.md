# Streaming Analytics for Browser

Capture video starts and stops as analytics events on an [HTML Video Element](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement).

## Setup

Install a version of `analytics-browser` that has stremaing analytics.

Currently, it's a release candidate: `npm install @amplitude/analytics-browser/v/2.48.0-video-analytics-6.0`


## Track a Video Element

Call `trackVideo` once per `HTMLVideoElement` you want instrumented

```javascript
import { trackVideo } from '@amplitude/analytics-browser';

trackVideo(amplitudeInstance, videoHtmlElement, {
  extraEventProperties: { }, // extra props to append to the event_properties of analytics events
});
```

## Event taxonomy

Event names and properties are prefixed with `[Streaming]`. Durations and positions are in **seconds**.

### Content

| Event | When |
| --- | --- |
| `[Streaming] Stream Started` | Content starts playing |
| `[Streaming] Stream Stopped` | Content stops or is interrupted |

`Stream Stopped` includes `[Streaming] Stop Reason`:

| `[Streaming] Stop Reason` | When |
| --- | --- |
| `paused` | User or app pause |
| `ended` | Playback reached the end, or Media3 auto/repeat item transition |
| `error` | Player error (`[Streaming] Error Message` when available) |
| `content_changed` | Media item changed without completing |
| `timeout` | Heartbeat while still playing (delayed event) |
| `untracked` | `untrackPlayer`, Amplitude teardown, or the player was collected |

Shared content properties: `[Streaming] Stream Session ID`, `[Streaming] Play ID`, `[Streaming] Content ID`, `[Streaming] Title`, `[Streaming] Media Type` (`video` or `audio`), `[Streaming] Delivery Mode`, `[Streaming] Duration Sec`, `[Streaming] Start Position Sec`, `[Streaming] Position Sec`, `[Streaming] Play Time Sec`, `[Streaming] Play Time Total Sec`, `[Streaming] Percent Completed` (stopped).

`[Streaming] Play Time Sec` is seconds of playhead movement while playing for that `[Streaming] Play ID`, with millisecond precision (pauses, seeks, and buffering do not count). A pause or a replay after the content ends starts a new play at zero and keeps the stream session. `[Streaming] Play Time Total Sec` is that same measure summed across the `[Streaming] Stream Session ID`; the latest Stream Stopped holds the session total. Seeking and buffering do not emit Stream Stopped.
