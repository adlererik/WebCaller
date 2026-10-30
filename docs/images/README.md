# Documentation images

This directory contains actual browser captures and separately labeled AI-generated product illustrations. All people, contacts and conversations are fictional. No real phone identity, setup link, server address or notification registration was used.

## Photorealistic call illustrations

The paired images show two ends of the same illustrative call, with both participants smiling:

| Image | What it shows |
|---|---|
| [Pixel 10 Pro XL](pixel-10-pro-xl-video-call.webp) | Maya's handset, with Alex in the main video and Maya in her self-preview. |
| [iPhone Pro](iphone-pro-video-call.webp) | Alex's handset, with Maya in the main video and Alex in his self-preview. |

Both use the example SAS **ocean maple velvet sunny**, H.265 video, Opus audio, stacked rate/unit columns, the actual **Wi-Fi · clear** wording, a timer, camera preview and transparent call controls. The video codec is **H.265**, not H.256. The example **1.6 Mbps video** and **64 kbps voice** are combined upload/download codec payload rates, consistent with a healthy Wi-Fi illustration; they exclude headers, TURN and file traffic. They are not measurements, guaranteed quality, hardware certification or proof of a verified call. Actual call words are freshly generated, and codec/rate selection depends on both phones and the connection. [Codec behavior](../CALL_NETWORK.md) · [How to compare the words](../CALL_VERIFICATION.md).

These are **AI-generated photographs**, not photographs of tested devices or app screenshots. The interface is modeled on WebCaller's call layout; exact spacing, device details and OS chrome can vary. The handset forms reference Google's [Pixel hardware specifications](https://support.google.com/pixelphone/answer/7158570?hl=en) and Apple's [iPhone 17 Pro specifications](https://support.apple.com/en-ie/125090).

Created on 2026-10-30 using the built-in image-generation tool, then exported at the unchanged 1024×1536 resolution to metadata-free WebP for a smaller README download. [Prompt set](CALL-IMAGE-PROMPTS.md). No app code, encryption, network settings or deployment was changed for these pictures.

## Actual interface captures

The following use WebCaller's shipped HTML/CSS/icons and message renderer, populated by `scripts/release-preview.js` with fictional contacts/messages:

- `desktop-chat.jpg`: desktop light appearance, 1280×820.
- `mobile-home.jpg`: mobile contacts, 390×844.
- `mobile-chat.jpg`: mobile dark chat, 390×844.
- `overview.jpg`: original HTML device-frame composition of the captures, 1600×1100.
- `demo-landscape.svg`: original vector illustration made for this documentation, rendered to a PNG Blob inside the fixture so the real supported image-message renderer displays it. It depicts no real location.

Run `node scripts/preview-release.mjs` and open the printed loopback address in a browser. Use `?view=chat`, `?view=home`, `?view=mobile` and `/overview` with the indicated viewport sizes. The overview needs the first captures saved in this directory. The fixture makes no application API calls and does not enroll phones or enable notifications. It is a development preview, not the production server.

Screenshots demonstrate appearance; example delivery checks/countdowns do not represent a real exchange, measured network quality or a security verification. Device frames are illustrative. Original documentation illustration/layout follows the repository's original-code MIT notice; application/dependency/artwork licenses remain as documented in the project.
