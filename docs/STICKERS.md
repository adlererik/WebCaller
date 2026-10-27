# Stickers

Open a chat and tap the folded-corner sticker icon beside the message field. Choose a pack along the bottom, then tap a sticker to send it immediately. Tap a star for Favorites; Recent shows stickers sent in this device. Recent and favorite choices are saved in the existing encrypted device store; no plaintext localStorage history is added.

The collection has **1,117 WebP stickers across 18 packs**, including **221 Angel Dust stickers in three dedicated packs**. Thirteen packs include their complete source snapshot. Five additional collections retain the available source images; missing source files are explicitly recorded in the catalog and never shown as broken tiles. Existing sticker IDs and favorites remain valid.

| Collection | Stickers |
| --- | ---: |
| Angel Dust (three packs) | 221 |
| Hazbin Hotel | 41 |
| The Amazing Digital Circus | 33 |
| Helluva Boss (Blitzo, mixed characters and Loona) | 213 |
| Demon Slayer (mixed characters and Shinobu) | 118 |
| Death Note | 87 |
| Spy x Family | 120 |
| Genshin Impact (Venti and chibi characters) | 211 |
| My Hero Academia (three packs) | 73 |

Images are bundled locally (about 28.2 MiB total). Opening the picker does not download every pack: images are lazy-loaded as you browse. Pack headings show the available sticker count; the bottom strip keeps its position when switching packs or adding Favorites. Opening the picker never contacts an external sticker catalog/CDN or tracking script. Sources, source/available counts, hashes, dimensions and artwork rights are in [the catalog](../public/stickers/catalog.json) and [artwork notice](../public/stickers/NOTICE.md). These are community collections, not official endorsements; artwork is separate from the code license.

Stickers render without a colored bubble. Reply, react, forward, pin, message information and deletion for both remain available. Forwarding generates a fresh attachment key and uses the destination chat's current timer. Stickers retain their original per-message disappearing duration, independent sender/recipient countdowns, Off option and encrypted local cache. Browser eviction may require another download.

## Encryption and delivery

1. A sticker is an authenticated attachment with an encrypted `sticker: true` marker. That marker, filename and random **AES-256-GCM** file key are inside the existing **libsignal PQXDH/Triple Ratchet** message. Image chunks use the existing attachment encryption and expiry binding. No new cryptographic algorithm or custom ratchet is introduced.
2. A separate low-priority **WebRTC data-only connection** carries encrypted chunks to an online recipient. SDP/ICE are signed and encrypted through the same pinned Signal identities. It requests no camera/microphone, creates no call/ringtone, and reuses existing STUN/TURN settings. Standard WebRTC direct connectivity may reveal network addresses to an accepted contact; TURN may relay it.
3. The receiver authenticates the Signal manifest and every AES-GCM chunk before caching. Its acknowledgement means the ciphertext cache accepted the sticker, not that a human has read it. Normal read receipts still determine viewed status.
4. Ciphertext is also retained through the normal authenticated attachment API for offline delivery, reopening, older clients, network changes and failed data channels. A bounded attempt falls back to this stored encrypted copy. Neither plaintext nor an external image URL is substituted. Bundled artwork itself is public; the host/CDN can observe asset requests and other routing metadata.

Frames are at most 16 KiB, with backpressure, bounded sizes, accepted-contact authorization, replay limits and idle/suspension cleanup. Stickers are limited to 512 KiB and use the existing audio-first pacing. Poor voice quality can pause sharing; instant delivery cannot be guaranteed through an unavailable connection. Call codecs, SAS, handover and notifications are unchanged.

## Emoji reactions

Tap or long-press a message, then choose a quick reaction or the three dots for the full emoji picker. Choosing your current emoji removes it. Reactions bind to the original signed wire lifetime while respecting local expiry; they never reset or extend a timer.

## Adding bundled artwork

Put appropriately authorized WebP files under `public/stickers/<pack-id>/<number>.webp` and add metadata to `catalog.json`. Pack IDs use lowercase letters, digits and hyphens; sticker IDs are numeric and filenames have three digits. Images must be at most 512×512 and 512 KiB. Record source, original rights, exact bytes and SHA-256. Paths must remain inside the local directory. Run `node --test tests/stickers.test.mjs` and update the expected inventory when deliberately adding images. Preserve attribution and review redistribution terms before publishing more artwork.
