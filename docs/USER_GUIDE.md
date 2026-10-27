# Using WebCaller

For stickers, tap the folded-corner icon beside the message field, choose a pack and tap a sticker to send. Use the star for Favorites. Recent/Favorites are saved in encrypted device storage. Stickers support the same original disappearing timer, replies, reactions, forwarding and deletion as other media. See the [sticker guide](STICKERS.md).

This release uses libsignal/PQXDH with Ed25519 application signatures. [Install](INSTALL.md) · [Security](SECURITY.md) · [Olm upgrade planning](APPROVED_CUTOVER.md).

## Your browser is your device

The first browser uses the owner's private setup QR/link. Other people accept an invitation or dial an optional personal calling code. Device keys and your access token stay in that browser's IndexedDB. Use the same browser for later calls. Clearing site storage or changing browsers creates a new device; there is no password-based recovery or multi-device identity synchronization.

## Conversations and invitations

**Invite someone** lets you enter the recipient’s name (optional), then **Create invitation** creates a link for one person. **Share invitation** opens the device's normal share sheet when supported; **Copy link** copies it. A recipient opens the full link, optionally enters a name and presses **Accept invitation**. The recipient’s name is already filled in if supplied. On iPhone/iPad, the link first explains how to add the website to the Home Screen, then accept from its icon. After acceptance, a short call-alert setup asks for notification permission and a locked-phone sound test. The link is single use and expires after 24 hours. Share it privately; its fragment contains the invite secret and inviter identity fingerprint.

The left conversation list shows your contacts and unread indicators. Tap a person to open their conversation. On narrow screens the back arrow returns to the list. Calling codes can also create a limited contact request; accepting, replying or answering saves the connection.

Press and hold a person in the conversation list for about a second, then choose **Delete contact and history**. On a computer you can right-click; keyboard users can use Shift+F10 or the Context Menu key. The dialog explains the effect before you confirm. Cancel keeps everything.

Removal disconnects the two contacts and deletes their shared messages, media, edits, receipts, reactions and pins from this server. Open phones clear that conversation and cached media; a closed phone learns the removal when it reconnects. A call with that person ends. Other conversations and your browser identity stay intact. To talk again, use a calling code or send a new invitation, unless either identity has blocked the other. Saved, forwarded or captured copies elsewhere cannot be recalled.

## Voice and video

The phone icon starts an audio-only call; the camera icon starts video. Allow the microphone when requested. An incoming call presents answer and decline buttons. Microphone/camera permissions are requested when making or answering, not when accepting an invitation.

During a call: **Mute microphone** toggles outgoing voice; **Turn camera on/off** stops/restarts the camera or upgrades audio to video; **Switch to back/front camera** changes the lens while keeping the microphone running; **End call** hangs up. The duration and quality stay at the top. Central caller details fade after video connects and return when reconnecting. If autoplay is blocked, tap **Tap to hear the call**. Use **More call options** or the top settings cog for settings. The top back arrow returns to chat while the call continues; **Return to call** brings back the controls.

When both phones are upright, video fills the call screen. Turn either phone sideways for a square picture; the self preview also becomes square. The display trims the frame to fit, while the transmitted video remains unchanged. Buttons fade after four seconds during a connected video call: tap the picture to show them again. The codecs and data rates fade with the buttons. Your security words stay centered at the top, with quality to their left and the call timer to their right. Your self preview stays visible: drag it to move it, or focus it and use the arrow keys on a computer. Its size is fixed; moving it does not change the transmitted video. Voice calls, incoming calls and reconnection keep their controls visible. Browser address/status bars are controlled by the browser; opening the saved Home Screen icon provides the app's standalone view.

Voice calls use a plain dark screen with a central initials avatar and a bottom tray. **Speaker / audio output** switches to an exposed speaker when available, or opens output choices/help. Each voice call starts on a detected earpiece/receiver or headset when the browser exposes one. Speaker activates when you tap its button; switching it off returns to that receiver/headset. When no such output is exposed, the browser/system default is used and the OS may still route through a speaker. Android/iPhone browsers may not expose a built-in earpiece/speaker choice. Use the phone’s own audio controls in that case. Video hides the speaker button and requests a speaker when the browser exposes one; hardware routing remains controlled by the browser/OS.

WebCaller uses full-duplex voice. On weak connections it reduces video first and may pause it completely. You can still talk while video is paused, if sufficient usable bandwidth remains. Reconnection attempts refresh ICE/TURN information. Long outages eventually end the call rather than leaving a false connected state.

## Messages

Type a message and use the send button. Text is encrypted for sender and recipient device identities. Delivery to an offline recipient is queued as ciphertext until its expiry. There is no persistent plaintext browser outbox or offline cache: sending needs a working connection. The UI clears displayed plaintext when backgrounded and loads/decrypts available unexpired messages again on return.

Open a chat, tap its **Settings** cog, then **Disappearing messages**. Choose **Off**, **4 weeks**, **1 week**, **1 day**, **8 hours**, **1 hour** (the default), **5 minutes**, or **30 seconds**, then **Save**. New chats default to disappearing messages after one hour; explicitly saved timer choices remain in effect. For an exact time, tap **Custom time**, scroll the left wheel to a number and the right wheel to seconds, minutes, hours, days or weeks, tap **Set**, then **Save**. **Cancel** leaves the custom choice unchanged; going back without Save discards the draft. The longest timer is four weeks.

This applies only to new messages you send in that conversation. Your countdown starts **when sent**. On the recipient’s phone, the full countdown starts **when they view the message in the chat**, even if your own copy has already disappeared. First viewing is remembered on that device: closing or refreshing the chat does not restart it. Visible messages are marked viewed after a brief on-screen check; opening a message’s actions or its media also counts. This applies to new timed text and media after this update. Older messages keep their original shared expiry.

**Off** keeps new text and media until deleted; it does not restore expired messages. Changing the setting does not extend existing messages or override the other sender’s choice. Either participant can still deliberately delete for both phones. To make delayed viewing possible, the server keeps the recipient’s encrypted unread copy until it is viewed or deleted. Read acknowledgements retry after reconnection; browser suspension or no connection can delay server cleanup. Copying/screenshotting content can preserve it outside WebCaller. Refresh both phones after updating; an older open version cannot read the new timing envelopes. The current mailbox view loads the latest 500 available messages for the device, rather than unlimited scrollback.

## Photos, video, files and voice messages

The composer follows a rounded Signal-style layout: **Emoji**, message field, **Camera** and **Microphone** in the pill, with a round **+** outside it. When text is entered, the + becomes the send button. The smiley opens a searchable Unicode emoji picker with categories and skin tones. Emoji artwork uses your device’s font, rather than Signal’s bundled artwork; newer emoji need an OS font that supports them.

Tap **Camera** for a live preview. Use the camera-switch button for a selfie or the main camera, then **Take photo**. **Phone camera** provides the browser’s native capture/picker fallback. Allow camera access when prompted. Tap **Microphone** to record a voice message; **Stop and preview** lets you listen before sending. Closing the recording discards it. Recording stops at five minutes. Voice notes request mono audio at 32 kbps, preferring AAC/MP4 when the browser can record it, then Opus/WebM or Ogg. Actual codec/rate depends on the browser.

Tap **+** for a bottom sheet with **Gallery**, **File** and **Location**. **Gallery** opens your phone’s photo/video picker; **File** opens its file picker. Recent image/video previews from this open chat appear above the icons; tap one to preview sending it again. A website cannot automatically list your camera roll. Choose one item up to 200 MB. Preview it, add an optional caption and press **Send**. Contents, filename, media type, caption and file key are encrypted. The server sees transfer size, routing and expiry metadata. Files use this chat’s disappearing timer starting when sending begins; choose a longer timer for a large file on a slow connection.

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

**Page title:** choose a name for the browser tab under **Settings → Your phone → Page title**. The default is **Home**. This preference stays in this browser; it does not rename your identity, contact list or server. It does not erase earlier history or rename an existing Home Screen icon.

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

Two small rows near the top show video above voice, with connection quality underneath. They show separate **Voice** and **Video** send/receive payload rates in **kbps** or **Mbps**, alongside their actual codecs. These update about every second; the rate appears after two samples. They show measured traffic, not the configured bitrate limit. Hovering each row on a computer shows send and receive separately. Browser media counters exclude network headers, TURN encapsulation and chat traffic, so this is not a mobile-provider billing meter. The codecs are obtained from active WebRTC streams; different send/receive codecs get arrow labels.

Sent bubbles and the plus/send buttons use Signal-style blue in both system themes. The two green circled received/viewed checks overlap; each retains its timestamp in message Info. **Edit** is available only for your own text/captions. The other person may react, reply or delete for both, but cannot edit what you wrote.

## Share while talking

Tap the back arrow at the top of the call to return to chat. Your call continues. Use + for Gallery, File or Location, or use the camera/microphone icons. Tap Return to call to see the picture again. On a weak connection, a file may say Waiting for connection · voice first; it resumes automatically when the call improves or ends. Keep the page visible while sharing. Voice and video each show their actual codec and current combined sending/receiving rate at the top of the call. See [Call networking](CALL_NETWORK.md).

## Call alerts and private audio

If your notification shows **Answer**, press it to open and answer that particular call. You may still need to allow the microphone or tap to hear playback. **Decline** dismisses a waiting call without opening the page. If your phone omits the buttons, tap the alert and use **Answer** on the page. In Android notification settings, enable sound and pop-up/banner alerts if offered. A website cannot force a sound when the phone/browser disallows it; run the locked-phone test on each actual device.

Voice calls start with an exposed earpiece/headset where the browser allows it. If the control says **Audio output: controlled by your phone**, this browser does not expose a built-in earpiece/speaker switch. The website cannot manufacture that control; use a connected headset for private audio or the phone’s output picker if available. Video requests an exposed speaker and restores the previous voice route afterward. On unsupported browsers the OS chooses the actual route.

When you send or fetch media during a call, video temporarily becomes smaller to make room while voice stays prioritized. It returns to the appropriate quality after sharing finishes. Very weak connections pause sharing and may pause video; the file resumes when there is spare capacity. Cached media opens without a new network transfer.

## Message alerts, countdowns and sharing progress

New message notifications say **New message**, without contact names or message text. Tap a new notification to open the sender’s conversation. If the message is still available, the app scrolls to it; if it disappeared or was deleted, the conversation opens with an explanation. An older notification generated before this update may still open the contact list.

Every message has a small disappearing countdown beside its timestamp and delivery marks. Long timers show days/hours or hours/minutes; the last hour shows minutes/seconds and the last minute shows seconds. Its original deadline does not reset when read or edited. Updates do not reload images or interrupt media playback.

During a file/media upload, connected phones show a spinner and **Sending / Receiving · percentage** placeholder in chat. It becomes the normal file or media bubble after the completed encrypted upload is verified. Opening an uncached attachment shows its own loading progress. Progress is temporary, encrypted and does not create message-history entries or a push alert for every update. A disconnected recipient sees progress after reconnecting if the sender is still announcing it; otherwise it sees the completed message when available. Cancelling, expiry or contact removal clears the placeholder; a lost connection lets an unrenewed placeholder expire within 20 seconds.

The call settings icon is a cog. Voice/video rates sit directly beside their codec names, with connection quality underneath. Sharing retains the current voice-first bandwidth policy.

For browser-history limitations and keeping this phone private, see [Browser privacy](BROWSER_PRIVACY.md). A website cannot erase browser history or hide that it has been used from someone inspecting the device.

## Compare the call words

During a connected voice/video call, four small words appear at the top. In video, the other person’s name is upper left and the words are centered in the same row; codec speeds and quality sit underneath. Read all four words in order and ask the other person to compare each to their own display. Repeat or spell an unclear word. If any differ, end the call and verify through a trusted route. “Preparing” or “unavailable” is not a successful comparison.

Reading the words is optional: the call works without confirmation, including a child’s call. Skipping them gives no additional human verification. Matching words check this call’s connection under trusted software; they do not defeat malicious website code or prove the security of all earlier messages. They are not a password/recovery phrase and are cleared on hang-up/page exit. [How it works](CALL_VERIFICATION.md).

Messages and files are end-to-end encrypted, but local readable history, metadata and browser/device traces have separate risks. Deleting a contact preserves minimal verification pins to resist identity replacement. Clearing site storage loses keys/history and those pins. See [security](SECURITY.md), [review](SECURITY_REVIEW.md) and [Signal comparison](../README.md#how-it-compares-with-signal).

## Optional extra ringing

If your server has enabled it, open **Settings → Extra ringing · ntfy** and follow the short guide. Android has a **Connect this phone** button. On iPhone, copy the subscription topic into **Topic name**, switch on **Use another server**, then copy the server into **Service URL** and tap **Subscribe**. Use the long `wc_` topic from this phone, not the friendly name “Incoming calls.” No subscription password is needed for the supplied server setup.

Return to WebCaller, press **Test the sound** and lock the phone. Confirm only after hearing it. If ntfy opens the wrong browser, return to your usual phone icon and choose the explicit phone-icon fallback. Calls and normal Web Push still work without ntfy. [Extra ringing](EXTRA_RINGING.md) explains sound changes, login/DNS troubleshooting and iPhone limitations.

## Calling codes

Choose **Settings → Your calling code**, enter an available number such as `4826`, and save. Friends open this website, tap **Dial a code**, enter your number and choose **Video call**, **Voice call** or **Message**. Their first visit sets up their own identity automatically. On iPhone, follow the one-time Home Screen guide and consistently use that icon. New people appear as contact requests; answering or replying accepts them. Unaccepted requests allow up to five text messages and no media uploads. You can accept or block them.

Use the same browser/icon on later visits to continue your saved conversation, subject to its disappearing timer. A code cannot recover lost browser keys. Codes are public addresses, so compare the four call words on your first call. [Calling-code guide](CALLING_CODES.md) explains setup, blocking, security and operator controls.

## Appearance and contact names

Open **Settings → Appearance** and choose **Dark**, **Light**, or **Use phone setting** (the default). The choice takes effect immediately and stays selected on this browser. The automatic option follows changes to your phone’s appearance.

Press and hold a person in the conversation list, or open their chat and choose **Conversation settings → Rename contact**. Change **Name on your phone** and tap **Save name**. Only you see this label; it does not change their device name, keys or conversation. **Use original name**, then **Save name**, restores their original name. The contact options retain **Delete contact and history**, with its separate confirmation; the combined block-and-delete shortcut has been removed from this menu. New contact requests still have a separate Block action.

The keyboard icon opens **Dial a code**. Its field has no example number filled in. **Video call** is the primary action and pressing Enter starts video. Choose **Voice call** explicitly for audio only; incoming calls still require you to answer.

## Contacts home screen

Search contacts at the top. **Dial a code** starts a new connection using someone’s number; **Invite someone** shares an invitation link. Tap a contact’s name to open the chat, tap their camera button for a video call, or use their three-dot button for contact options such as renaming. Pressing and holding the name still opens those options. The bottom of the screen shows this phone’s name and connection status. The home screen follows your chosen appearance; the chat and call screens keep their existing layout.

### Finding your settings

Tap the cog on the home screen for phone settings, or the cog in an open chat for that conversation’s options. The grouped page keeps Appearance (Automatic, Light or Dark), Your calling code, contact naming, the message timer, Automatic connection management, Call alerts, optional Extra ringing with ntfy, the connection check and device removal. Open a conversation first to change its name or disappearing-message timer. Device removal still asks for confirmation.

### Video orientation and app icon

Calls fill the upright screen when both people are upright. If either screen is landscape, the picture becomes a square on both sides; it reaches the side edges in portrait and the top/bottom edges in landscape. The self preview also becomes square. Fitting may trim the picture's edges, while transmitted frames and adaptive data savings remain unchanged. The handset mark appears in the browser, home screen metadata and notification icon. Existing Home Screen icons may remain cached. Keep your existing shortcut and site data; do not remove and reinstall the shortcut just to refresh its artwork, because some phones store that web app’s identity separately.

## Sending a photo or large file while talking

Tap the call's back arrow to open your chat, then **+ → Gallery** for a photo/video or **+ → File** for another document. Choose a file up to **200 MB** and tap **Send**. Your call continues. A spinner and percentage show progress; the recipient sees the completed photo/media in the chat. **Return to call** restores the picture.

A strong connection can send much faster than earlier releases. Voice still takes priority: video temporarily reduces, and sharing may say **Waiting for connection · voice first** when the call needs the link. Leave the page visible; it resumes automatically when the call improves. Closing/backgrounding cancels the transfer, so choose it again when ready. Short disappearing timers may expire before a large file finishes; choose a longer timer or Off first.

Verified encrypted media stays in this browser's cache until its local timer ends or it is deleted, subject to storage limits/eviction. Reopening the chat should use those bytes without downloading them again. A new browser/device has a separate cache. Very large files need enough phone memory/storage; failure to keep a local copy is reported and may require another download later.

## Check the identity and live call

In the chat, tap the contact's **name/header** to open the full safety fingerprint. Compare every group through a separate trusted channel or in person. It is a 256-bit pairwise hexadecimal identity check, not a password. During a call, compare **all four security words in order**. Matching words check the accepted call connection under the documented assumptions; skipping them does not interrupt the call and adds no manual verification. If words/fingerprint differ, stop sharing sensitive information and verify the real person elsewhere. The app deliberately does not depend on a third-party key-transparency service; manual checks/pins have different limits. [Security](SECURITY.md) · [SAS details](CALL_VERIFICATION.md).

## Call screen and picture quality

Video fills an upright call screen when both peers are upright; if either screen is sideways, both views use square fitting. Some edges can be cropped by display fitting. Controls and codec/rate rows fade after inactivity and return on a tap; the SAS, quality and elapsed time remain. Drag the small self preview to move it. The codec rows show measured voice/video **upload plus download payload rates**, not your internet plan's speed.

Automatic mode uses the conservative cellular/unknown budget whenever either phone cannot confirm Wi-Fi. Healthy video can use up to 500 kbps each way there; voice stays first. Poor conditions lower quality, may pause video/files, and cautiously resume after improvement. A temporary radio gap is possible when walking between Wi-Fi/cellular. [Detailed policies](CALL_NETWORK.md).
