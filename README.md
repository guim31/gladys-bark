# Bark for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that sends the messages of Gladys to your iPhone through
[Bark](https://github.com/Finb/Bark), the free and open-source iOS push
notification app: the messages of your scenes, the answers of Gladys and its
system messages, plus notifications with a title, a level, a sound, a link and
an image from your scenes. Works with the official server (`api.day.app`) or a
self-hosted [bark-server](https://github.com/Finb/bark-server).

> **Developed without the hardware: feedback welcome.** The integration was
> tested against a real bark-server v2.4.0 (the `finab/bark-server` Docker
> image), but not with an iPhone nor inside a real Gladys. Please report what
> works and what does not in the
> [issues](https://github.com/guim31/gladys-bark/issues) or on the
> [Gladys forum](https://community.gladysassistant.com).

## Features

- **A Gladys notification channel** (send-only communication integration):
  every message Gladys sends to a user (the _Send Message_ scene action, the
  answers of Gladys, the system messages) goes to the iPhone of that user.
- **Per user**: each Gladys user pastes the device key of their own Bark app
  in "My account", and picks a level. A user without a key receives nothing.
- **Scene action** _Send a Bark notification_ to one or several iPhones:
  title, subtitle, message, level (normal, time-sensitive, passive, critical),
  sound, 30-second ringing, group, link opened on tap, image, icon. Outputs:
  delivered, devices reached, error.
- **Optional encryption** of the texts (AES-128/192/256-CBC, as the Bark app
  decrypts it).
- **Scene triggers**: _Bark server offline_ (two failed checks 30 s apart),
  _Bark server back online_, _Bark notification not sent_ (filtered by reason
  and origin, at most once per reason every 15 minutes so it cannot loop).
- **Dashboard widget** _Bark_: server state, notifications sent and failed
  today, the last scene notifications (never the messages sent to one user), a
  _Send a test_ button; the list and the button can be hidden.
- **Configuration test**: checks the server and sends a test notification.
- Four languages (English, French, German, Spanish).

## Requirements

- Gladys Assistant **5.1.0** or later, with Internet access.
- The Bark app on each iPhone or iPad, and its device key (the app shows
  `https://api.day.app/<key>/`; pasting the whole address works).

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-bark`. Paste the device keys used by scenes,
click **Send a test notification**, then let each user fill in "My account".
The full documentation is in [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

- `POST /push` with a JSON body; the device key travels in the body only,
  never in a URL nor in a log. One request per key, in parallel.
- Encryption: the title, subtitle, body, link, icon and image go into
  `ciphertext` (AES-CBC, PKCS7, random 16-character IV sent as `iv`); the
  level, sound, group and `call` stay readable, as the server and iOS need
  them.
- A health check every 5 minutes, without any key: `GET /ping`, and the
  version from `GET /info` when the server has it. It drives the connection
  status of the Configuration screen, the widget and the online / offline
  triggers.
- Gladys waits 5 seconds for a message to be acknowledged: the request to Bark
  gives up after 4 seconds. Bodies are cut to fit Apple's 4 KB limit.
- `/data/bark-state.json` keeps the last known server state (so a restart
  neither repeats nor forgets a transition) and the statistics of the widget.
  No key and no address is stored there.

## Checked on a real server, and what was not

Checked against `finab/bark-server` v2.4.0 in a Docker container, the
integration running in the locked-down sandbox of Gladys (read-only root, all
capabilities dropped, 256 MB; about 20 MB used at rest): the health check and
version, a push with every option (title, subtitle, critical level, sound,
ringing, link, image, icon) and an encrypted push, both validated by the
server and handed to Apple, which refused the invented device tokens of the
test (`BadDeviceToken`, as expected without a real iPhone); an unknown key; the
server forgetting a refused token; a server that does not answer. Then the
whole integration against the fake Gladys of the SDK and that real server:
test action, scene action, Gladys message, trigger and widget. The real
answers are in [test/fixtures/bark/](test/fixtures/bark/).

Not checked: the delivery by Apple to a real iPhone (it needs a phone
registered with Apple), how the Bark app displays levels, sounds and encrypted
notifications, and the "My account" block and the scene editor in a real
Gladys.

## Limitations

- Send only: Bark has no replies.
- iPhone and iPad only.
- Bark takes images by address only: the image of _Send a camera image_ is
  left out, with a line saying so.
- Encryption in CBC mode only (the app also offers ECB and GCM).
- Every push goes through Apple, even from a self-hosted server: the
  integration is marked "cloud".

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and an in-memory Bark server
that answers with the real fixtures; they never touch the network. See
[CLAUDE.md](CLAUDE.md) for the project rules.

## Credits

- [Bark](https://github.com/Finb/Bark) and
  [bark-server](https://github.com/Finb/bark-server) by Finb (MIT): the API,
  the levels, the ringtone names and the encryption scheme. The logo on the
  cover is the Bark app icon from the Bark repository (MIT).
- [Gotify for Gladys](https://github.com/guim31/gladys-gotify): the structure
  of this integration (health checks, widget, triggers, `/data` store).
- [ntfy for Gladys](https://github.com/callemand/gladys-ntfy) by callemand:
  the shape of a send-only channel. No code was copied.
- Home Assistant has no core Bark integration to start from.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Bark or its
author.

## License

Apache-2.0
