# Using WebCaller

## Your browser is your device

The first browser uses the owner's private setup QR/link. Other people accept an invitation. Device keys and your access token stay in that browser's IndexedDB. Use the same browser for later calls. Clearing site storage or changing browsers creates a new device; there is no password-based recovery or multi-device identity synchronization.

## Conversations and invitations

**Invite someone** lets you enter the recipient’s name (optional), then **Create invitation** creates a link for one person. **Share invitation** opens the device's normal share sheet when supported; **Copy link** copies it. A recipient opens the full link, optionally enters a name and presses **Accept invitation**. The recipient’s name is already filled in if supplied. On iPhone/iPad, the link first explains how to add the website to the Home Screen, then accept from its icon. After acceptance, a short call-alert setup asks for notification permission and a locked-phone sound test. The link is single use and expires after 24 hours. Share it privately; its fragment contains the invite secret and inviter identity fingerprint.

The left conversation list shows your contacts and unread indicators. **Search people** filters it locally. Tap a person to open their conversation. On narrow screens the back arrow returns to the list. Only established contacts can route messages or calls to one another.

## Voice and video

The phone icon starts an audio-only call; the camera icon starts video. Allow the microphone when requested. An incoming call presents answer and decline buttons. Microphone/camera permissions are requested when making or answering, not when accepting an invitation.

During a call: **Mute microphone** toggles outgoing voice; **Turn camera on/off** stops/restarts the camera or upgrades audio to video; **Switch to back/front camera** changes the lens while keeping the microphone running; **End call** hangs up. The duration and quality stay at the top. Central caller details fade after video connects and return when reconnecting. If autoplay is blocked, tap **Tap to hear the call**. Use **More call options** or the top information icon for settings. The top back arrow returns to chat while the call continues; **Return to call** brings back the controls.

Voice calls use a plain dark screen with a central initials avatar and a bottom tray. **Speaker / audio output** switches to an exposed speaker when available, or opens output choices/help. Switching off selects the phone/system default, which the OS may still route through a speaker or headset. Android/iPhone browsers may not expose a built-in earpiece/speaker choice. Use the phone’s own audio controls in that case. Video hides the speaker button and requests a speaker when the browser exposes one; hardware routing remains controlled by the browser/OS.

WebCaller uses full-duplex voice. On weak connections it reduces video first and may pause it completely. You can still talk while video is paused, if sufficient usable bandwidth remains. Reconnection attempts refresh ICE/TURN information. Long outages eventually end the call rather than leaving a false connected state.

## Messages

Type a message and use the send button. Text is encrypted for sender and recipient device identities. Delivery to an offline recipient is queued as ciphertext until its expiry. There is no persistent plaintext browser outbox or offline cache: sending needs a working connection. The UI clears displayed plaintext when backgrounded and loads/decrypts available unexpired messages again on return.

Settings → **Disappearing messages** chooses 30 seconds, 5 minutes, 1 hour, 24 hours (default), or 7 days for new messages you send in that conversation. The sender's signed timer starts at send time, including unread/offline messages. Changing the setting does not extend existing messages or override the other sender's timer. Copying/screenshotting content can preserve it outside WebCaller.

## Photos, video, files and voice messages

The composer follows a rounded Signal-style layout: **Emoji**, message field, **Camera** and **Microphone** in the pill, with a round **+** outside it. When text is entered, the + becomes the send button. The smiley opens a searchable Unicode emoji picker with categories and skin tones. Emoji artwork uses your device’s font, rather than Signal’s bundled artwork; newer emoji need an OS font that supports them.

Tap **Camera** for a live preview. Use the camera-switch button for a selfie or the main camera, then **Take photo**. **Phone camera** provides the browser’s native capture/picker fallback. Allow camera access when prompted. Tap **Microphone** to record a voice message; **Stop and preview** lets you listen before sending. Closing the recording discards it. Recording stops at five minutes. Voice notes request mono audio at 32 kbps, preferring AAC/MP4 when the browser can record it, then Opus/WebM or Ogg. Actual codec/rate depends on the browser.

Tap **+** for a bottom sheet with **Gallery**, **File** and **Location**. **Gallery** opens your phone’s photo/video picker; **File** opens its file picker. Recent image/video previews from this open chat appear above the icons; tap one to preview sending it again. A website cannot automatically list your camera roll. Choose one item up to 10 MB. Preview it, add an optional caption and press **Send**. Contents, filename, media type, caption and file key are encrypted. The server sees transfer size, routing and expiry metadata. Files use this chat’s disappearing timer starting when sending begins; choose a longer timer for a large file on a slow connection.

**Photos, video and audio load automatically on both sides when their bubbles are visible in the open chat.** Older off-screen media waits until you scroll to it. This uses data for visible media in that conversation, including again after returning from a hidden page because plaintext previews are cleared. There is no automatic audio/video playback. Tap a photo or video to open the full-screen viewer; video has playback controls. Voice messages have an inline audio player and **Open audio** for the viewer. **Close media** or Escape returns to chat. Common raster images and MP4/WebM/Ogg media render through the browser’s own decoders. An unsupported codec can be saved instead. HTML/SVG and other files download as files and never execute inline. Files load only when requested.

**Save media/Save file** downloads an external copy. Copies remain outside WebCaller and are not erased by timers or remote deletion. There is no persistent decrypted media cache. Transfers are unavailable during calls and stop when a call starts or the page is hidden; automatic media loading resumes after the call/when visible. Retry an interrupted upload. Captures and unsent media drafts are discarded on backgrounding or starting a call. Pending and completed uploads share expiring storage quotas.

## Share a location

Tap **+** → **Location** → **Use current location**. Allow the browser’s location request. Check the map, add a place name if wanted, then press **Send location**. Nothing is sent to the contact until Send. This shares one position, not live tracking. No street-address lookup is performed; the optional place name and coordinates identify the spot. Accuracy depends on the phone’s GPS and surroundings.

Both phones see the map image and a Google Maps link. Tap the image for full-screen viewing, **Open in Maps** for directions, and **Close media** to return. If the map cannot load, a clearly labelled coordinate/pin preview and the link still work. Location media follows the disappearing timer and Delete for both. Updating an existing server needs a restart to enable the location permission header; no new secrets or ports are required.

Map previews use OpenStreetMap by default. After your explicit location tap, the browser requests only the few visible map tiles; the provider receives IP address and map area. The rendered image and coordinates travel encrypted to the contact. The recipient receives the encrypted image instead of automatically contacting the map provider. Opening Maps shares the coordinates with Google. Map tiles may remain in ordinary browser caches and provider logs; deleting the chat cannot erase those traces. No API key is required for the default service, which is best effort.

## Delete for both

Long-press a bubble, right-click it on a computer, or tap its little **…** button. Choose **Delete for both**. Either participant can remove a sent or received text/media message. The server removes the message and encrypted media chunks; connected phones remove the bubble and close its viewer. An offline phone learns the deletion on reconnect. A minimal deletion marker (message ID, participant IDs and original expiry) remains until the original timer expires, preventing an old envelope from being uploaded again. It contains no message text, filename or media key.

A website cannot reliably prevent operating-system screenshots or another camera photographing the screen. Background previews are cleared and chat is hidden when printing. External copies cannot be recalled.

## Typing indicators

Three animated dots show when the other person types. Only a signed encrypted typing/not-typing status is sent; the draft itself is never sent. Updates are throttled, expire within eight seconds and are never stored or replayed by the server. Dots clear after sending, leaving the field, switching conversations, hiding the page or inactivity. Delivery needs both pages connected.

## Settings

**Connection · Automatic:** always used. It selects Wi-Fi quality only if the browser explicitly reports Wi-Fi/Ethernet. Unknown networks, including Safari, use data saver. Video still adapts under congestion. Older saved manual modes are ignored.

**Ringing:** enabled automatically. The first ordinary tap or keypress unlocks browser sound. There is no separate Enable ringing step. Sound restrictions, device Focus/mute and OS suspension still apply.

**Set up call alerts:** follow the same guided setup shown after accepting an invitation. Allow notifications, tap **Send test alert**, close the page and lock your phone. An alert should arrive after about eight seconds. Tap it, then press **I heard it** only if it made a sound. **I didn’t hear anything** gives phone-specific sound/permission help. iPhone requires the website’s Home Screen icon; use that icon for calls afterward. Call reminders request the normal notification sound up to three times; the open page uses a repeating ringtone. Notification text contains no message bodies/contact names. Browser/OS notification history may remain. See [Call alerts](CALL_ALERTS.md).

**Check calling connection:** attempts a relay-only ICE allocation. Success means a relay candidate was allocated, not that every network or full media path works. Test a real call across separate networks.

**Remove this device and its conversations:** after confirmation, deletes that server identity, contacts, its invitations, queued messages and push subscription, then clears the local identity/settings. Other people's copies, browser history and OS traces may remain. You need a fresh invitation to rejoin, or private owner setup if no users remain.

## Safety number

Tap your contact's name to see the safety number. Compare it through a channel you trust. Known key changes are blocked. The original invitation still depends on trusting its delivery channel. This is custom encryption, not audited Signal Protocol; see [Security](SECURITY.md).
