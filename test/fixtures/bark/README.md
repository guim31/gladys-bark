# Bark fixtures

Real answers of a **bark-server v2.4.0** (`finab/bark-server` Docker image),
captured on 2026-11-25 in a throwaway container. The device key in
`error-unknown-key.json` was replaced by `KEY`; nothing else was edited. Each
file is `{ "status": <HTTP status>, "body": <JSON body> }`.

| File                              | Request                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `ping.json`                       | `GET /ping`                                                              |
| `info.json`                       | `GET /info`                                                              |
| `push-success.json`               | `POST /push`: the answer once Apple accepted the push                    |
| `error-unknown-key.json`          | `POST /push` with a key the server does not know (also any unknown path) |
| `error-bad-device-token.json`     | `POST /push` with a registered key whose Apple token is refused          |
| `error-device-token-invalid.json` | the next `POST /push` with that key: the server has forgotten the token  |

`push-success.json` cannot come from a test server (it needs a real iPhone
registered with Apple): it is the answer documented by bark-server
(`CommonResp` with code 200), the same shape as `ping.json`.
