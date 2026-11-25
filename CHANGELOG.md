# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Bark as a Gladys notification channel: every message Gladys sends to a user
  (the "Send Message" scene action, the answers of Gladys, its system
  messages) reaches the iPhone of that user, through the official Bark server
  or a self-hosted bark-server.
- "My account" for each Gladys user: the device key of their own Bark app and
  the level of their messages.
- Scene action "Send a Bark notification" to one or several iPhones, with
  title, subtitle, level, sound, 30-second ringing, group, link, image and
  icon, returning whether it was sent, the number of devices reached and the
  error.
- Optional encryption of the texts (AES-CBC, as the Bark app decrypts it).
- Scene triggers "Bark server offline", "Bark server back online" and "Bark
  notification not sent".
- Dashboard widget "Bark": server state, notifications sent and failed today,
  the last scene notifications and a test button, each block hideable.
- "Send a test notification" action, in four languages (English, French,
  German, Spanish).
