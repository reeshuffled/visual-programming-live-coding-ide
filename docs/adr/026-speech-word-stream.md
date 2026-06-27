# ADR 026 — Speech Recognition Word Stream

**Status**: Accepted  
**Date**: 2026-06-27

## Context

`audio.onSpeech(fn)` fires once per complete utterance (after a pause in speech). It uses `interimResults: false` on the underlying `SpeechRecognition` instance, so there is no way for user code to receive words as they are being spoken. Live creative use cases (karaoke, word rain, real-time viz) need per-word events that fire while the user is still talking.

The existing `audio:word` bus event has a different contract: it is a registered-word trigger (`onWord('fire', fn)`) that fires only for pre-declared words on final results. Reusing or extending it would break existing subscribers.

## Decision

### Always enable `interimResults: true`

The single shared `_recognition` instance is changed to `interimResults: true` unconditionally. Existing `audio:speech` and `onWord` behaviour is unaffected — they filter for `isFinal` as before. The overhead of receiving interim results is negligible.

### Two new bus events

```
audio:word:interim  { word, utteranceId, wordIndex }
audio:word:final    { word, utteranceId, wordIndex }
```

`utteranceId` is a monotonic integer that increments on each `isFinal` result — all interim and final words within one spoken phrase share the same ID. `wordIndex` is the 0-based position of the word within that utterance. Together they let subscribers deduplicate without maintaining their own counters (the `placed`-counter pattern from user scripts becomes unnecessary).

### New helper

```js
audio.onWordStream(fn)
// fn({ word, utteranceId, wordIndex, final })
```

Fires for every interim and final word. `final: false` = still speaking; `final: true` = utterance committed. Internally registers `_wordStreamHandlers` cleared on reset alongside `_speechHandlers`.

### Existing surface unchanged

`audio:speech`, `audio:word`, `audio.onSpeech`, `audio.onWord` keep their exact current contracts. No callers need updating.

## Consequences

- Live word streaming available with zero boilerplate: `audio.onWordStream(({word}) => ...)`.
- `utteranceId` + `wordIndex` eliminate the class of dedup bugs seen in karaoke scripts.
- Two new bus event names become public API — renaming them later is a breaking change.
- `interimResults: true` always active even when no one calls `onWordStream` — accepted as negligible overhead.
