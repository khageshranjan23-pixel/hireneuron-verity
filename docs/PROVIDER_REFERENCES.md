# Official integration references checked during packaging

Use current official docs and account capabilities when building; pin SDKs after testing. These links guide integration, not prove this package's media paths have been live-tested.

- LiveKit Python RTC: https://docs.livekit.io/reference/python/livekit/rtc/index.html
- LiveKit VideoStream: https://docs.livekit.io/reference/python/livekit/rtc/video_stream.html
- LiveKit grants: https://docs.livekit.io/frontends/reference/tokens-grants/
- LiveKit Python API: https://docs.livekit.io/reference/python/livekit/api/
- LiveKit turns: https://docs.livekit.io/agents/logic/turns/
- LiveKit nodes: https://docs.livekit.io/agents/logic/nodes/
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Deepgram live audio: https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- Deepgram endpointing/interim/final: https://developers.deepgram.com/docs/understand-endpointing-interim-results
- Deepgram TTS: https://developers.deepgram.com/reference/text-to-speech/speak-request
- Deepgram PCM containers: https://developers.deepgram.com/docs/tts-container

Design choices checked: phone camera-only grants and no subscription; explicit independent VideoStream per track; schema-constrained Gemini responses still need semantic/citation validation; is_final and speech_final have different meanings; raw linear16 audio needs the correct sample rate and no WAV header when publishing PCM.

No provider pricing or supported concurrency is claimed. Confirm current model names, quotas, regions, licensing and retention before deployment.
