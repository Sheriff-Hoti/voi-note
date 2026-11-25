# voi-note

A personal Android app that turns spoken thoughts into text notes, transcribed entirely on the phone.

## Language

**Note**:
The saved result of one Recording: its Transcript and the moment it was captured.
_Avoid_: Memo, entry, voice note

**Recording**:
One continuous stretch of captured speech, from the moment capture starts until it is Stopped, Discarded, or hits the length cap.
_Avoid_: Session, clip, take

**Transcript**:
The text the Speech Model produced from a Recording, before the user edits it.
_Avoid_: Transcription (for the text itself), output

**Speech Model**:
The on-device model that turns a Recording into a Transcript.
_Avoid_: LLM, AI, engine. Exception: `SpeechEngine` is the name of its port in the voice-notes core (spec #1).

**Pending Note**:
A Note whose Recording has been stopped but whose Transcript is not ready yet.
_Avoid_: Draft, processing note

**Instant Capture**:
The app starting a Recording on its own when launched fresh from the home screen, once a Speech Model is installed.
_Avoid_: Auto-record, quick mode, speech mode

**Discard**:
Ending a Recording without keeping it: no Note is made and its audio is deleted.
_Avoid_: Cancel, delete (delete is for existing Notes)
