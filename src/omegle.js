// based off this wonderful guide by nucular:
// https://gist.github.com/nucular/e19264af8d7fc8a26ece
const EventEmitter = require('events');
const request = require('request-promise');

const BASE_DOMAIN = 'omegle.com';
const BASE_URL = 'http://' + BASE_DOMAIN;
const BASE_HEADERS = {
  'Accept': 'application/json',
  'Accept-Encoding': 'gzip,deflate',
  'Accept-Language': 'en-US;q=0.6,en;q=0.4',
  'Origin': BASE_URL,
  'Referer': BASE_URL,
  'Host': 'omegle.com'
};
const DEFAULT_UA =
  `Mozilla/5.0 (compatible; Node.js omegle library) Node.js/${process.version}`;
const DEFAULT_LANGUAGE = 'en';
const RANDID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECAPTCHA_CHALLENGE_REGEX = / {4}challenge : '(.+?)',\n/;

/**
 * Composes new header object from default and additional headers
 * @param {Object} opts Additional headers to add
 * @return {Object} The created header object
 */
function makeHeaders(opts) {
  return Object.assign({}, BASE_HEADERS, opts);
}

/** The main client class */
class OmegleClient extends EventEmitter {
  /**
   * Creates a new omegle client
   * @param {Object} [opts] Options for the clientID
   * @param {String} [opts.language] Language code to send to omegle
   * @param {String} [opts.userAgent] User-Agent string to use
   */
  constructor(opts) {
    super();
    if (!opts) opts = {};
    this.serverList = [];
    this.currentServer = null;
    this.unmonForced = null;
    this._serverList = null;
    this.randid = '';
    this.id = null; // this can be used to check if a connection exists
    this.commonInterests = null;
    this.topics = null;
    this._isWaiting = false;
    this.connected = false;
    this.language = opts.language || DEFAULT_LANGUAGE;
    this._lastChallenge = null;
    this._lastEventRequest = null;
    this.userAgent = opts.userAgent || DEFAULT_UA;

    for (let i = 0; i < 8; i++) {
      let random = Math.floor(Math.random() * RANDID_CHARS.length);
      this.randid += RANDID_CHARS[random];
    }
    request.post({
      url: BASE_URL + '/status',
      qs: {
        nocache: Math.random(),
        randid: this.randid
      },
      json: true,
    })
      .then(body => {
        this.serverList = body.servers;
        this.unmonForced = body.force_unmon;
        this.emit('ready');
      })
      .catch(err => this.emit('error', err));
  }
  /**
   * Connect to the server and start a conversation
   * @param {Array} topics A list of "interests" to give to omegle
   */
  connect(topics) {
    if (this.id) throw new Error('Already connected!');

    this.currentServer = `${this.serverList[Math.floor(Math.random() *
      this.serverList.length)]}.${BASE_DOMAIN}`;
    this._serverUrl = `http://${this.currentServer}`;

    let opts = {
      rcs: 1,
      firstevents: 1,
      randid: this.randid,
      spid: '',
      lang: this.language
    };
    if (topics && topics[0]) {
      this.topics = topics;
      opts.topics = JSON.stringify(topics);
    }
    if (this.unmonForced) opts.group = 'unmon';
    this.requestPost('/start', undefined, opts)
      .then(body => {
        this.id = body.clientID;
        this.emit('gotID', this.id);
        this._eventFetcher();
        this._eventHandler(body.events);
      })
      .catch(err => this.emit('error', err));
  }
  /** End the chat and disconnect from the server */
  disconnect() {
    this.requestPost('/disconnect', {id: this.id})
      .catch(() => {}); // we don't care if this errors
    this._disconnected();
  }
  /**
   * Send a message to the conversation
   * @param {String} message The message to send
   */
  send(message) {
    this.requestPost('/send', {
      msg: message,
      id: this.id
    })
      .catch(err => this.emit('error', err));
  }
  /** Start "typing" on omegle */
  startTyping() {
    this.requestPost('/typing', {id: this.id})
      .catch(err => this.emit('error', err));
  }
  /** Stop "typing" on omegle */
  stopTyping() {
    this.requestPost('/stoppedtyping', {id: this.id})
      .catch(err => this.emit('error', err));
  }
  /** 
   * Tells the omegle server to stop searching for common interests
   * The web-based client does this automatically after some time
   */
  stopLookingForCommonLikes() {
    if (!this._isWaiting) throw new Error('state is not waiting');
    this.requestPost('/stoplookingforcommonlikes', {id: this.id})
      .catch(err => this.emit('error', err));
  }
  /**
   * Send the response to the reCAPTCHA challenge
   * @param {String} response
   */
  sendCaptchaResponse(response) {
    if (!this._lastChallenge) throw new Error('No captcha offered');
    this.requestPost('/recaptcha', {
      id: this.id,
      challenge: this._lastChallenge,
      response
    }).catch(err => this.emit('error', err));
  }
  /**
   * Start fetching events for another session (effectively stealing it)
   * The original client needs to stop fetching events, otherwise we might miss
   * some events
   * @param {String} id The id of the session
   * @param {String} [server] The name of the server the session was on
   */
  transferSession(id, server) {
    if (!server) {
      server = this.serverList[Math.floor(Math.random() *
        this.serverList.length)];
    }
    this.currentServer = `${server}.${BASE_DOMAIN}`;
    this._serverUrl = `http://${this.currentServer}`;
    this.id = id;
    this.emit('gotID', id);
    this._eventFetcher();
    // we don't know what state the previous chat was in, so we assume it was
    // connected
    this.connected = true;
  }
  /** 
   * Stop fetching events for the current session and return the id so the
   * session can be seamlessly transferred to another client
   * (see OmegleClient#trnasferSession)
   * @return {String} The current session id
   */
  prepareTransferSession() {
    // stop fetching events and return the session id
    let id = this.id;
    this.id = null;
    return id;
  }
  /**
   * Internal method used to grab a challenge given a reCAPTCHA site key
   * @param {String} id The server's reCAPTCHA site key or whatever it is called
   * @return {String} The reCAPTCHA challenge id
   */
  _resolveCaptcha(id) {
    return request('https://www.google.com/recaptcha/api/challenge', {
      qs: {k: id}
    })
      .then(body => {
        let challenge = RECAPTCHA_CHALLENGE_REGEX.exec(body)[1];
        if (!challenge) {
          throw new Error('reCAPTCHA challenge resolution failed');
        }
        this._lastChallenge = challenge;
        return challenge;
      })
      .catch(e => this.emit('error', e));
  }
  /** Internal method used to handle disconnections */
  _disconnected() {
    // handle disconnect
    this.emit('disconnected');
    this.id = null;
    this.currentServer = null;
    this._serverUrl = null;
    this.id = null;
    /*
    if (this._lastEventRequest) {
      this._lastEventRequest.abort();
      this._lastEventRequest = null;
    }
    */
    this.commonInterests = null;
    this.topics = null;
    this._isWaiting = false;
    this._lastChallenge = null;
    this.connected = false;
  }
  /**
   * Internal method to handle events from omegle
   * @param {Array} events List of events to handle
   */
  _eventHandler(events) {
    for (let e of events) {
      let event = e[0];
      let args = e.slice(1);
      switch (event) {
      case 'waiting':
        this._isWaiting = true;
        this.emit('waiting');
        break;
      case 'connected':
        this._isWaiting = false;
        this.emit('connected');
        this.connected = true;
        break;
      case 'statusInfo':
        this.emit('statusInfo', ...args);
        // we really don't care about this
        break;
      case 'count':
        // this doesn't seem to ever be sent
        this.emit('count', ...args);
        break;
      case 'commonLikes':
        this.commonInterests = args[0];
        this.emit('commonLikes', ...args);
        break;
      case 'partnerCollege':
        this.emit('partnerCollege', ...args);
        break;
      case 'serverMessage':
        this.emit('serverMessage', ...args);
        break;
      case 'recaptchaRequired':
        this._resolveCaptcha(args[0])
          .then(c => this.emit('recaptchaRequired', c));
        break;
      case 'recaptchaRejected':
        this._resolveCaptcha(args[0])
          .then(c => this.emit('recaptchaRequired', c));
        break;
      case 'identDigests':
        this.emit('identDigests', ...args);
        break;
      case 'error':
        this.emit('omegleError', ...args);
        this._disconnected();
        break;
      case 'connectionDied':
        this.emit('connectionDied');
        this._disconnected();
        break;
      case 'antinudeBanned':
        this.emit('antinudeBanned');
        this.unmonForced = true;
        this._disconnected();
        break;
      case 'typing':
        this.emit('typing');
        break;
      case 'stoppedTyping':
        this.emit('stoppedTyping');
        break;
      case 'gotMessage':
        this.emit('message', ...args);
        break;
      case 'strangerDisconnected':
        this.emit('strangerDisconnected');
        this._disconnected();
        break;
      default:
        this.emit('unhandledEvent', event, ...args);
        break;
      }
    }
  }
  /** Internal method used to fetch events from omegle */
  _eventFetcher() {
    this._lastEventRequest = this.requestPost('/events', {id: this.id});
    this._lastEventRequest
      .then(body => {
        this._eventHandler(body);
        if (this.id) this._eventFetcher();
      })
      .catch(() => {
      // retry the request
        if (this.id) this._eventFetcher();
      });
  }
  /**
   * Sends a POST request to a url under omegle
   * @param {String} path Path to post to
   * @param {Object} data Form data to send
   * @param {Object} qs Query string to use for the request
   * @return {Promise} The promise returned from request.post()
   */
  requestPost(path, data, qs) {
    let headers = makeHeaders({
      'User-Agent': this.userAgent
    });
    return request.post({
      url: (this._serverUrl || BASE_URL) + path,
      qs,
      form: data,
      headers,
      json: true,
      keepAlive: true,
      gzip: true
    });
  }
}

module.exports = OmegleClient;
