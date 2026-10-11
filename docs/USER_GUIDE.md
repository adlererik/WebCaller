# Using WebCaller

## Your browser is your device

The first browser uses the owner's private setup QR/link. Other people accept an invitation. Device keys and your access token stay in that browser's IndexedDB. Use the same browser for later calls. Clearing site storage or changing browsers creates a new device; there is no password-based recovery or multi-device identity synchronization.

## Conversations and invitations

**Invite someone** lets you enter the recipient’s name (optional), then **Create invitation** creates a link for one person. **Share invitation** opens the device's normal share sheet when supported; **Copy link** copies it. A recipient opens the full link, optionally enters a name and presses **Accept invitation**. The recipient’s name is already filled in if supplied. On iPhone/iPad, the link first explains how to add the website to the Home Screen, then accept from its icon. After acceptance, a short call-alert setup asks for notification permission and a locked-phone sound test. The link is single use and expires after 24 hours. Share it privately; its fragment contains the invite secret and inviter identity fingerprint.

The left conversation list shows your contacts and unread indicators. **Search people** filters it locally. Tap a person to open their conversation. On narrow screens the back arrow returns to the list. Only established contacts can route messages or calls to one another.

Press and hold a person in the conversation list for about a second, then choose **Delete contact and history**. On a computer you can right-click; keyboard users can use Shift+F10 or the Context Menu key. The dialog explains the effect before you confirm. Cancel keeps everything.

Removal disconnects the two contacts and deletes their shared messages, media, edits, receipts, reactions and pins from this server. Open phones clear that conversation and cached media; a closed phone learns the removal when it reconnects. A call with that person ends. Other conversations and your browser identity stay intact. To talk again, send a new invitation. Saved, forwarded or captured copies elsewhere cannot be recalled.

## Voice and video

The phone icon starts an audio-only call; the camera icon starts video. Allow the microphone when requested. An incoming call presents answer and decline buttons. Microphone/camera permissions are requested when making or answering, not when accepting an invitation.

During a call: **Mute microphone** toggles outgoing voice; **Turn camera on/off** stops/restarts the camera or upgrades audio to video; **Switch to back/front camera** changes the lens while keeping the microphone running; **End call** hangs up. The duration and quality stay at the top. Central caller details fade after video connects and return when reconnecting. If autoplay is blocked, tap **Tap to hear the call**. Use **More call options** or the top information icon for settings. The top back arrow returns to chat while the call continues; **Return to call** brings back the controls.

Voice calls use a plain dark screen with a central initials avatar and a bottom tray. **Speaker / audio output** switches to an exposed speaker when available, or opens output choices/help. Each voice call starts on a detected earpiece/receiver or headset when the browser exposes one. Speaker activates when you tap its button; switching it off returns to that receiver/headset. When no such output is exposed, the browser/system default is used and the OS may still route through a speaker. Android/iPhone browsers may not expose a built-in earpiece/speaker choice. Use the phone’s own audio controls in that case. Video hides the speaker button and requests a speaker when the browser exposes one; hardware routing remains controlled by the browser/OS.

WebCaller uses full-duplex voice. On weak connections it reduces video first and may pause it completely. You can still talk while video is paused, if sufficient usable bandwidth remains. Reconnection attempts refresh ICE/TURN information. Long outages eventually end the call rather than leaving a false connected state.

## Messages

Type a message and use the send button. Text is encrypted for sender and recipient device identities. Delivery to an offline recipient is queued as ciphertext until its expiry. There is no persistent plaintext browser outbox or offline cache: sending needs a working connection. The UI clears displayed plaintext when backgrounded and loads/decrypts available unexpired messages again on return.

Settings → **Disappearing messages** chooses 30 seconds, 5 minutes, 1 hour, 24 hours (default), or 7 days for new messages you send in that conversation. The sender's signed timer starts at send time, including unread/offline messages. Changing the setting does not extend existing messages or override the other sender's timer. Copying/screenshotting content can preserve it outside WebCaller.

## Photos, video, files and voice messages

The composer follows a rounded Signal-style layout: **Emoji**, message field, **Camera** and **Microphone** in the pill, with a round **+** outside it. When text is entered, the + becomes the send button. The smiley opens a searchable Unicode emoji picker with categories and skin tones. Emoji artwork uses your device’s font, rather than Signal’s bundled artwork; newer emoji need an OS font that supports them.

Tap **Camera** for a live preview. Use the camera-switch button for a selfie or the main camera, then **Take photo**. **Phone camera** provides the browser’s native capture/picker fallback. Allow camera access when prompted. Tap **Microphone** to record a voice message; **Stop and preview** lets you listen before sending. Closing the recording discards it. Recording stops at five minutes. Voice notes request mono audio at 32 kbps, preferring AAC/MP4 when the browser can record it, then Opus/WebM or Ogg. Actual codec/rate depends on the browser.

Tap **+** for a bottom sheet with **Gallery**, **File** and **Location**. **Gallery** opens your phone’s photo/video picker; **File** opens its file picker. Recent image/video previews from this open chat appear above the icons; tap one to preview sending it again. A website cannot automatically list your camera roll. Choose one item up to 10 MB. Preview it, add an optional caption and press **Send**. Contents, filename, media type, caption and file key are encrypted. The server sees transfer size, routing and expiry metadata. Files use this chat’s disappearing timer starting when sending begins; choose a longer timer for a large file on a slow connection.

**Photos, video and audio load automatically on both sides when their bubbles are visible in the open chat.** Older off-screen media waits until you scroll to it. The first opening transfers that media. After sending or successfully opening a file, the phone keeps an encrypted local copy, so closing/reopening the chat, backgrounding the page or reloading normally does not transfer it again. Decrypted previews are still cleared when the page backgrounds. The copy follows the original disappearing timer and is removed when deletion is received; an offline phone learns remote deletion on reconnect before reopening media. Clearing website data, private browsing, low storage or browser eviction can require another download. Files not yet opened still need their first transfer. There is no automatic audio/video playback. Tap a photo or video to open the full-screen viewer; video has playback controls. Voice messages have an inline audio player and **Open audio** for the viewer. **Close media** or Escape returns to chat. Common raster images and MP4/WebM/Ogg media render through the browser’s own decoders. An unsupported codec can be saved instead. HTML/SVG and other files download as files and never execute inline. Files load only when requested.

**Save media/Save file** downloads an external copy. Copies remain outside WebCaller and are not erased by timers or remote deletion. There is no persistent decrypted media cache. Transfers remain available during calls, using paced pieces and waiting when voice needs the connection. Hiding the page cancels a transfer; retry it when visible. Captures and unsent media drafts are discarded on backgrounding or starting a call. Pending and completed uploads share expiring storage quotas.

## Share a location

Tap **+** → **Location**. The app immediately requests your current position with high accuracy and without reusing a cached position. Allow the browser’s location request. Check the map, add a place name if wanted, then press **Send location**. Nothing is sent to the contact until Send. This shares one position, not live tracking. No street-address lookup is performed; the optional place name and coordinates identify the spot. Accuracy depends on the phone’s GPS and surroundings.

Both phones see the same encrypted map image. Android/other devices open Google Maps; Apple devices open Apple Maps. The link is chosen on the viewing device, so an Android sender can share a location with an iPhone recipient. Tap the image for full-screen viewing, **Open in Maps** for directions, and **Close media** to return. If the map cannot load, a clearly labelled coordinate/pin preview and the link still work. Location media follows the disappearing timer and Delete for both. Updating an existing server needs a restart to enable the location permission header; no new secrets or ports are required.

Map previews use OpenStreetMap by default. After your explicit location tap, the browser requests only the few visible map tiles; the provider receives IP address and map area. The rendered image and coordinates travel encrypted to the contact. The recipient receives the encrypted image instead of automatically contacting the map provider. Opening Maps shares the coordinates with the chosen Maps provider. Map tiles may remain in ordinary browser caches and provider logs; deleting the chat cannot erase those traces. No API key is required for the default service, which is best effort.

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


## Tap a message

Tap a text bubble, long-press a bubble, or use its **Message options** button. The menu has a quick row of reactions and **More reactions** for the full searchable Unicode emoji picker. Tap your current emoji again to remove it. Reaction chips appear just below the bubble on both phones.

- **Reply:** quote that message above your next text. Cancel using the small ×. Tap a sent quote to return to its original. A deleted or expired original becomes “Original message unavailable”; the reply does not keep a hidden copy of its text.
- **Edit:** change your own text or media caption. Save updates both phones and adds an Edited label. Location cards keep their original coordinates and cannot be edited. Editing does not restart the timer.
- **Forward:** choose one of your contacts. The copy gets the destination chat’s timer. Media may need to load first; during calls it follows the same voice-first pacing. A forwarded copy is independent of the original.
- **Copy:** copy the text, caption, location link or file name to your clipboard. Copies outside this app are not removed by its disappearing timer.
- **Select:** select up to 20 messages using the checkboxes, then Copy, Forward or Delete them. Use × to leave selection mode.
- **Info:** see sent, received, seen, edited and expiry times. “Not yet” means the corresponding acknowledgement has not arrived.
- **Pin / Unpin:** show a shortcut at the top of the chat on both phones. A pin does not keep a message after its timer expires.
- **Delete for both:** confirm to remove the message and attached media for both participants. Either person can do this. Previously saved or forwarded copies cannot be recalled.

## Delivery and seen marks

An outgoing message gets one small green circled check when the recipient’s open app verifies/decrypts it. The time beside it is the received time. A second green circled check appears after the bubble has been visible in the active conversation. Receiving a push notification or storing ciphertext on the server does not count as receiving or viewing the message. Marks may arrive later when a phone reconnects; Info shows both exact timestamps. Receipt state is encrypted and expires with the message.

## Appearance and permissions

The app automatically follows the phone’s light/dark appearance, including changes while it is open. No theme setup is needed. The message text field has no blue focus box; keyboard focus remains visible on buttons.

There is no extra app prompt for precise location. The browser/OS still requires permission when it has not already been granted. Choose Precise location in that system prompt if offered. A website cannot force precise GPS when the user or OS allows only approximate location. **Refresh location** obtains a new position; location is shared only after Send.


## Call information at the top

Two small rows near the top show video above voice, with connection quality on the right. They show separate **Voice** and **Video** send/receive payload rates in **kbps** or **Mbps**, alongside their actual codecs. These update about every second; the rate appears after two samples. They show measured traffic, not the configured bitrate limit. Hovering each row on a computer shows send and receive separately. Browser media counters exclude network headers, TURN encapsulation and chat traffic, so this is not a mobile-provider billing meter. The codecs are obtained from active WebRTC streams; different send/receive codecs get arrow labels.

Sent bubbles and the plus/send buttons use Signal-style blue in both system themes. The two green circled received/viewed checks overlap; each retains its timestamp in message Info. **Edit** is available only for your own text/captions. The other person may react, reply or delete for both, but cannot edit what you wrote.

## Share while talking

Tap the back arrow at the top of the call to return to chat. Your call continues. Use + for Gallery, File or Location, or use the camera/microphone icons. Tap Return to call to see the picture again. On a weak connection, a file may say Waiting for connection · voice first; it resumes automatically when the call improves or ends. Keep the page visible while sharing. Voice and video each show their actual codec and current combined sending/receiving rate at the top of the call. See [Call networking](CALL_NETWORK.md).

## Call alerts and private audio

If your notification shows **Answer**, press it to open and answer that particular call. You may still need to allow the microphone or tap to hear playback. **Decline** dismisses a waiting call without opening the page. If your phone omits the buttons, tap the alert and use **Answer** on the page. In Android notification settings, enable sound and pop-up/banner alerts if offered. A website cannot force a sound when the phone/browser disallows it; run the locked-phone test on each actual device.

Voice calls start with an exposed earpiece/headset where the browser allows it. If the control says **Audio output: controlled by your phone**, this browser does not expose a built-in earpiece/speaker switch. The website cannot manufacture that control; use a connected headset for private audio or the phone’s output picker if available. Video requests an exposed speaker and restores the previous voice route afterward. On unsupported browsers the OS chooses the actual route.

When you send or fetch media during a call, video temporarily becomes smaller to make room while voice stays prioritized. It returns to the appropriate quality after sharing finishes. Very weak connections pause sharing and may pause video; the file resumes when there is spare capacity. Cached media opens without a new network transfer.
