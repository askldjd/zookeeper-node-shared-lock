'use strict';
const zookeeper = require('node-zookeeper-client');
const lockProtocol = require('./lock-protocol');
const EventEmitter = require('events').EventEmitter;

const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');

function createLockService({
  host = 'localhost',
  port = '2181',
  resourceName = '/__lock_service_resource__',
  maxRetryCount = 0,
  initialRetryWaitMs = 100
} = {}) {

  const zkClient = zookeeper.createClient(`${host}:${port}`);
  let lockService = {};

  // Event emitter provides notification for lockService user.
  lockService.events = new EventEmitter();

  // See README.md
  lockService.lock = (resourceId, ttl, cb = () => {}) => {
    let ctx = {
      cb,
      client: zkClient,
      ttl,
      maxRetryCount: lockService.maxRetryCount,
      initialRetryWaitMs: lockService.initialRetryWaitMs,
      resourceName: resourceName,
      resourceId,
      events: lockService.events
    };
    lockProtocol.lock(ctx);
  };

  // See README.md
  lockService.unlock = (lockCtx, cb = () => {}) => {
    if (!lockCtx) {
      return setImmediate(cb, 'lock context must be provided');
    }
    lockCtx.cb = cb;
    lockProtocol.unlock(lockCtx);
  };

  // See README.md
  lockService.backoff = (maxRetryCount, initialRetryWaitMs) => {
    lockService.maxRetryCount = maxRetryCount;
    lockService.initialRetryWaitMs = initialRetryWaitMs;
  };

  // Initialize the retry count and retry wait using the provided options.
  lockService.backoff(maxRetryCount, initialRetryWaitMs);

  // Connected to ZK on startup and initialize the default resource parent node.
  // Once ZK is ready and the node is created, 'ready' event will be emitted.
  zkClient.once('connected', () => {
    debug('Connected to ZooKeeper.');
    zkClient.create(resourceName, null, zookeeper.CreateMode.PERSISTENT,
      (err) => {
        if (err) {
          if (err.getCode() !== zookeeper.Exception.NODE_EXISTS) {
            error('Unable to create resource', resourceName, err);
            lockService.events.emit('error');
            return;
          } else {
            debug('reusing existing resource', resourceName);
          }
        }

        lockService.events.emit('ready');
      });
  });

  zkClient.once('connectedReadOnly', () => {
    error('server is read-only');
    lockService.events.emit('connectedReadOnly');
  });
  zkClient.once('disconnected', () => {
    error('server connection has been disconnected');
    lockService.events.emit('disconnected');
  });
  zkClient.once('expired', () => {
    error('server connection has expired');
    lockService.events.emit('expired');
  });
  zkClient.once('authenticationFailed', () => {
    error('server authentication failed');
    lockService.events.emit('authenticationFailed');
  });

  zkClient.connect();

  return lockService;
}

module.exports = createLockService;
