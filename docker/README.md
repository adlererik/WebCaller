# Containers on the experimental branch

**The stable prebuilt images and release setup bundle do not contain libsignal/PQXDH.** They remain the stable Olm release. This branch does not publish an experimental prebuilt image, registry tag or all-in-one container bundle. Use [native experimental installation](../docs/INSTALL_NATIVE.md) first.

The `docker/` bundle is retained as stable-format development/reference source. Its launcher is deliberately disabled by `EXPERIMENTAL-BRANCH` here so it cannot silently fetch/install the stable images while appearing to install this experiment. For the stable bundle, switch to the [stable branch's own guide](https://github.com/adlererik/WebCaller/blob/main/docker/README.md).

Advanced contributors can **build from this branch's source** using the root Dockerfile/compose recipe, after completing a recursive clone and `npm run prepare:source`. Use a new Compose project/volumes, hostname/origin, port, database and secrets; keep `WEBCALLER_TEST_INSTANCE=libsignal-preview-v1` in the container environment. The source offer and AGPL notices must accompany the built image. The source recipe is not certified as a complete experimental deployment, and building an image does not establish working TURN, HTTPS, ntfy or phone alerts.

Do not pull a `0.17.1` image to test this branch or attach it to an experimental database. Do not overwrite a working native/Docker installation. Stable image-publishing workflows are disabled on this branch. [Licensing](../LICENSING.md) · [Networking](../docs/NETWORKING.md) · [Verification](../docs/VERIFICATION.md).
