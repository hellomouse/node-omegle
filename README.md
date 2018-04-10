# node-omegle

An Omegle client library for Node.js based off
[nucular's research](https://gist.github.com/nucular/e19264af8d7fc8a26ece)

## Example

```js
const Client = require('node-omegle');
let client = new Client();

client.on('message', message => console.log(message));
client.on('disconnected', () => console.log('Disconnected'));

client.on('ready', () => client.connect());
client.on('connected', () => {
  console.log('Connected');
  client.send('beep boop i am a bot');
  setTimeout(() => client.disconnect(), 10000);
});
```

## API Documentation

### `class OmegleClient`

The base class representing the client

#### `new OmegleClient(opts)`

Constructor for the class

Arguments:

- `opts.language`: Language code to send to omegle
- `opts.userAgent`: User-Agent string to use for requests

#### `connect(topics)`

Connect to omegle

This method must be called after the `ready` event is fired

Arguments:

- `topics`: List of interests to send to omegle

#### `disconnect()`

Disconnect from omegle, ending any chat that is ongoing

#### `send(message)`

Send a message to the chat

Arguments:

- `message`: The message to send

#### `startTyping()`

Start "typing" on omegle

#### `stopTyping()`

Stop "typing" on omegle

#### `stopLookingForCommonLikes()`

Tells the omegle server to stop looking for a person with common interests.
The web-based omegle client does this after a while.

#### `sendCaptchaResponse(response)`

Sends a response to the captcha requested by omegle. See the captcha section
below for more information on how to handle captchas.

Arguments:

- `response`: The text result to the captcha

#### `transferSession(id, server)`

Transfers a session by session id (with optional server argument).

Arguments:

- `id`: Omegle session id
- `server`: Optional server name to connect to

#### `prepareTransferSession()`

Stops fetching events and returns the session id so the session can be
resumed elsewhere.

Returns the current session id

#### Events

- `ready`: The instance has successfully fetched connection information from
  omegle, must be fired before connect is called
- `waiting`: Waiting for a connection
- `connected`: Connected to the other user
- `statusInfo`: Status information from omegle
- `count`: Doesn't really seem to ever be sent by omegle
- `commonLikes`: Array of common interests
- `partnerCollege`: College the user attends, if applicable
- `serverMessage`: A "server message" from omegle
- `recaptchaRequired`: The omegle server gave you a captcha to solve, see
  captcha section below
- `recaptchaRejected`: Same as above, but the previous response was incorrect
- `identDigests`: Identity stuff, seems to be used when submitting logs
- `error`: Request error, thrown locally by the client
- `omegleError`: Omegle gave you an error
- `connectionDied`: The connection died abnormally
- `antinudeBanned`: The client was banned to the unfiltered section for
  being bad
- `typing`: User is typing
- `stoppedTyping`: User has stopped typing
- `message`: The user sent a text message
- `strangerDisconnected`: The user ended the chat
- `unhandledEvent`: Omegle sent something that we don't know what to do with

## Handling captchas

You can't, because Google shut down reCAPTCHA v1 and omegle hasn't done
anything about it yet

## License

ISC
