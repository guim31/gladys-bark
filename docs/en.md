# Bark

Receive the messages of Gladys on your iPhone with [Bark](https://bark.day.app),
a free and open-source iOS app for push notifications: the messages of your
scenes, the answers of Gladys and its system messages, plus notifications with
a title, a level, a sound, a link and an image from your scenes. Use the
official Bark server (`api.day.app`) or your own `bark-server`.

> **Developed without the hardware: feedback welcome.** This integration was
> tested against a real bark-server (v2.4.0), which accepted its requests, but
> not with an iPhone nor in a real Gladys installation. If something does not
> work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-bark/issues).

## What you need

- Gladys Assistant 5.1.0 or later, with Internet access.
- The **Bark** app on each iPhone (or iPad) that receives the notifications,
  from the App Store. Open it once and allow notifications.
- The **device key** of each iPhone: the Bark app shows an address like
  `https://api.day.app/AbCdEf.../`; the key is the part after the server
  address. Copying the whole address works too.
- Optional: your own server
  ([bark-server](https://github.com/Finb/bark-server), Docker image
  `finab/bark-server`), chosen in the Bark app as well. Every push still goes
  through Apple's notification service.

## Set up

Install the integration from **Integrations → Install from GitHub** with the
address `https://github.com/guim31/gladys-bark`, then fill in its
Configuration screen:

- **Bark server address**: `https://api.day.app` by default; the address of
  your own bark-server otherwise (a path behind a reverse proxy works).
- **Device keys for scenes**: the keys of the iPhones that receive the scene
  notifications and the test. Several iPhones: separate the keys with commas.
- **Default level**: how iOS presents the notifications (see below).
- **Notification group**: Bark groups the notifications under this name
  (Gladys by default).
- **Encryption key (optional)**: to encrypt the texts, as the Bark app
  allows. In the app, open the encryption settings, choose AES, mode CBC,
  padding PKCS7, and a key of 16, 24 or 32 characters (AES-128, 192 or 256);
  enter the same key here. The IV is random for each notification: leave the
  IV of the app as it is. Empty: not encrypted. The key applies to every message, personal ones included: every iPhone must use it in its Bark app.
- **Accept a self-signed certificate**: only for an `https://` address of your
  own server whose certificate you created yourself.
- **Language of the integration texts**: the errors of the scene action, the
  test notification and the note added to a message whose image could not
  follow.

Then click **Send a test notification**: the integration checks the server
and sends a notification to the device keys for scenes.

**My account**: each Gladys user decides in the "My account" block of the
integration's page whether they receive the messages Gladys sends them:

- **Your device key**: the key (or the address) shown by YOUR Bark app.
  Several devices (iPhone and iPad): separate them with commas.
- **Level of your messages**: your own level, or _Default of the
  integration_.

A user without a key receives nothing: the device keys for scenes are never
used for a personal message. **Delete my values** stops the messages.

## What Gladys sends

Every message Gladys sends to a user goes through Bark when that user saved a
key in "My account": the **Send Message** scene action, the answers of Gladys,
and its system messages. In the **Send Message** action, recent versions of
Gladys let you pick the channel.

- The title is "Gladys", in the notification group of the configuration.
- Bark takes images by address only: the image of **Send a camera image** is
  left out, and a line says so under the text.
- Very long texts are cut (Apple refuses a notification over 4 KB).

The levels, as iOS presents them:

| Level          | Notification                                                    |
| -------------- | --------------------------------------------------------------- |
| Normal         | sound and banner                                                |
| Time-sensitive | shown even in a Focus mode                                      |
| Passive        | silent, added to the list only                                  |
| Critical       | sounds even when the iPhone is muted (allow it in the Bark app) |

## Dashboard

The **Bark** widget shows:

- whether the server answers, and its version when it gives it;
- the notifications sent today, and the failures with the last reason;
- the last notifications sent by **scenes** (title, date, level, or "Not
  sent"). The messages Gladys sends to one user are counted but never listed:
  the dashboard is seen by the whole household;
- a **Send a test** button, which does the same as the configuration test.

The widget settings can hide the list and the button.

## Scenes

### Triggers

- **Bark server offline**: the server stopped answering. It must fail two
  checks 30 seconds apart (a check runs every 5 minutes, and right after a
  delivery that could not reach the server). Variable: the error.
- **Bark server back online**: the server answers again after being offline.
  Variable: the server version (empty when unknown).
- **Bark notification not sent**: a message could not be sent. Filters: the
  reason (server unreachable, device key missing or refused, configuration
  incomplete, message refused) and who sent it (a Gladys message or the Bark
  scene action). Variables: reason, origin, error. To avoid loops, it fires at
  most once per reason every 15 minutes.

The first state known after the installation, or after changing the address,
is not announced: only a change is.

### Actions

**Send a Bark notification**, to the device keys for scenes:

- **Title** and **Subtitle** (optional).
- **Message** (required). Scene variables work here, as in every field.
- **Level**: one of the list, or _Default of the integration_.
- **Sound**: one of the ringtones of the Bark app, or its default.
- **Ring for 30 seconds**: the sound repeats, like a call.
- **Group** (optional): the group of the configuration otherwise.
- **Link opened on tap** (optional): an `https://` address, or an app link
  (`shortcuts://`, `tel:`, `mailto:`, `maps:`, `sms:`).
- **Image address** and **Icon address** (optional): `https://` images. Your
  iPhone downloads them: they must be reachable from the phone, not only from
  Gladys.

The action gives three values to the next actions of the scene:
**Notification sent** (yes when every device got it), **Devices reached** and
**Error** (empty when sent). A wrong field (an empty message, an unknown
sound, a link that is not allowed) fails the action, and the scene log says
why.

### Scene ideas

- **Alarm**: when the alarm goes off, **Send a Bark notification** titled
  "Alarm", level Critical, sound alarm, with **Ring for 30 seconds**.
- **Fallback**: on **Bark notification not sent** with the reason "Server
  unreachable", send the message through another channel. Do not answer it
  with another Bark notification.
- **Washing machine**: when the power of the plug drops, a Passive
  notification "Laundry done" that does not wake anyone.

## Troubleshooting

The Configuration screen shows the state of the server. The messages:

- _the Bark server does not answer_: check the address, and that Gladys has
  Internet access (or that your bark-server runs). Gladys runs the integration
  in its own Docker network: `localhost` is the integration itself.
- _device key unknown to this server_: the key is wrong, or it belongs to
  another server (the Bark app shows which one).
- _Apple no longer knows this iPhone_: the Bark app was deleted or
  reinstalled; open it and copy its new key.
- _the encryption key must have 16, 24 or 32 characters_: fix the key, or
  empty it.
- _certificate refused_: tick **Accept a self-signed certificate**.
- _no device key_: fill in **Device keys for scenes**.

A user receives nothing? Check that they saved a key in "My account", and that
the **Send Message** action of the scene does not send to another channel
only. The logs of the integration give the details; they never show a key.

## Limits

- **Send only**: Bark has no replies. You cannot talk to Gladys from Bark.
- iPhone and iPad only (Bark is an iOS app).
- No camera images in Gladys messages: Bark shows images from a web address
  only.
- Needs Internet: every push goes through Apple, even from your own server.
- Encryption: AES in CBC mode only (not ECB nor GCM), one key for every iPhone.
- No server address with a user name and password (basic authentication).
- Tested against a real bark-server v2.4.0, but not with an iPhone nor in a
  real Gladys: the last step, Apple's delivery to the phone, could not be
  checked.
- The official server is a free service run by the author of Bark: keep a
  reasonable number of notifications.

This integration is not affiliated with Bark nor its author.
