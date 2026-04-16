<p align="center">
  <img src="https://assets.tokbox.com/img/vonage/Vonage_VideoAPI_black.svg" height="56px" alt="Vonage Video API" />
</p>

<h1 align="center">Vonage Client Network Test</h1>

<p align="center">
  Pre-call network diagnostics for the <a href="https://developer.vonage.com/en/video/overview">Vonage Video API</a> — test connectivity and predict call quality before a session starts.
</p>

<p align="center">
  <a href="LICENSE.md"><img alt="Apache-2.0 license" src="https://img.shields.io/github/license/vonage/vonage-video-api-network-test.svg" /></a>
  <a href="https://www.npmjs.com/package/@vonage/video-client-network-test"><img alt="npm version" src="https://img.shields.io/npm/v/@vonage/video-client-network-test.svg" /></a>
  <a href="https://github.com/Vonage/vonage-video-api-network-test/actions"><img alt="CI" src="https://github.com/Vonage/vonage-video-api-network-test/actions/workflows/ci-pull-request.yml/badge.svg" /></a>
</p>

---

## 📦 Monorepo Consolidation

Merged from three previously separate branding-specific repositories:

- [opentok-network-test-js](https://github.com/opentok/opentok-network-test-js) — the OpenTok-branded library
- [vonage-video-api-network-test](https://github.com/Vonage/vonage-video-api-network-test) — the Vonage-branded library
- [opentok-network-test](https://github.com/opentok/opentok-network-test) - repository of Network Test examples for Android and iOS

The library supports both `@vonage/video-client-network-test` (Vonage) and `opentok-network-test-js` (OpenTok) distributions — see [`samples/js/README.md`](samples/js/README.md) for details on building for each brand.

---

## Repository Structure

| Directory | Description |
| --- | --- |
| [`lib/js`](lib/js) | Source for the `@vonage/video-client-network-test` npm package |
| [`samples/js`](samples/js) | Web app demonstrating connectivity and quality tests |
| [`samples/Android`](samples/Android) | Android app demonstrating stream quality testing |
| [`samples/iOS`](samples/iOS) | iOS app demonstrating stream quality testing |

---

## Sample Applications

Each sample shows a complete, runnable integration for its platform.

| Platform | What it demonstrates | README |
| --- | --- | --- |
| **Web** | Connectivity test + quality test with live bitrate graphs | [README](samples/js/README.md) |
| **Android** | Stream quality check using the Vonage Video Android SDK stats listeners | [README](samples/Android/README.md) |
| **iOS** | Stream quality check using the Vonage Video iOS SDK network stats delegate | [README](samples/iOS/README.md) |

---

## Documentation & Resources

| Resource | Link |
| --- | --- |
| **Vonage Video API Overview** | [developer.vonage.com/en/video/overview](https://developer.vonage.com/en/video/overview) |
| **Live Pre-call Test Tool** | [tools.vonage.com/video/precall](https://tools.vonage.com/video/precall/) |
| **Full API Reference** | [Reference](lib/js/README.md) |
| **Server SDKs** (generate session IDs & tokens) | [developer.vonage.com/en/tools](https://developer.vonage.com/en/tools) |
| **Media Router Guide** | [Create a session](https://developer.vonage.com/en/video/guides/create-session#the-media-router-and-media-modes) |
| **Changelog** | [Releases](https://github.com/Vonage/vonage-video-api-network-test/releases) |

---

## Contributing

We 💙 contributions! To get started:

1. Read [Contributing](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) guides.
2. Look for [open issues](https://github.com/Vonage/vonage-video-api-network-test/issues) you can help with.
3. Open a pull request — we'll review it promptly.

---

## Getting Help

| Channel | Link |
| --- | --- |
| 🐛 Open an issue | [github.com/…/issues](https://github.com/Vonage/vonage-video-api-network-test/issues) |
| 📖 Support portal | [api.support.vonage.com](https://api.support.vonage.com/hc/en-us/) |
| 💬 Developer community | [Vonage Developer Slack](https://developer.nexmo.com/community/slack) |
| 🐦 Twitter / X | [@VonageDev](https://twitter.com/VonageDev) |

---

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE.md) file for details.
