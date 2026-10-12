# Voice entry

Folio does not declare `android.permission.INTERNET`. The app does not upload audio, transcripts, or the ledger.

The microphone button requests `RECORD_AUDIO` at runtime, then starts Android's `SpeechRecognizer` on the main thread. The request sets `RecognizerIntent.EXTRA_PREFER_OFFLINE` and the language `ar-EG` or `en-US`. Prefer-offline is a request to the recognizer. Folio cannot force a provider to stay on the device.

If this phone has no offline speech pack, or the recognizer reports a network, server, or language error, Folio shows this English line and the Arabic equivalent, and it explains the Google app path (Settings, Voice, Offline speech recognition, Arabic (Egypt) and English):

> Offline speech pack not installed: install Arabic/English offline speech in Google settings.

Nothing is saved. The same is true when the microphone permission is denied, when no recognizer is installed, or when speech is not recognized. WebView `webkitSpeechRecognition` is not used.

The user can tap **Open system speech screen**. That launches `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`. The screen runs in the Google app, or in whichever app handles that intent, not in Folio. That other app may send audio to its provider over the network even though Folio has no internet permission. Folio still sets prefer-offline on that intent. The only thing that comes back is text. It is a draft on Ask Folio until the user confirms it.

The home hint says Folio prefers offline speech and that the system speech screen's recognizer may use the network.
