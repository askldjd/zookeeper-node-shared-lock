'use strict';
const zookeeper = require('node-zookeeper-client');
const lockProtocol = require('./lock-protocol');
const EventEmitter = require('events').EventEmitter;

const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');

function createLockService(opt) {
  opt = opt || {};

  opt.host = opt.host || 'localhost';
  opt.port = opt.port || '2181';
  opt.resourceName = opt.resourceName || '/__lock_service_resource__';
  opt.maxRetryCount = opt.maxRetryCount || 0;
  opt.initialRetryWaitMs = opt.initialRetryWaitMs || 100;

  const zkClient = zookeeper.createClient(`${opt.host}:${opt.port}`);
  let lockService = {};
  lockService.events = new EventEmitter();

  // See README.md
  lockService.lock = (resourceId, ttl, cb) => {
    cb = cb || function() {};
    let ctx = {
      cb,
      client: zkClient,
      ttl,
      maxRetryCount: lockService.maxRetryCount,
      initialRetryWaitMs: lockService.initialRetryWaitMs,
      resourceName: opt.resourceName,
      resourceId,
      events: lockService.events
    };
    lockProtocol.lock(ctx);
  };

  // See README.md
  lockService.unlock = (lockCtx, cb) => {
    cb = cb || function() {};
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
  lockService.backoff(opt.maxRetryCount, opt.initialRetryWaitMs);

  // Connected to ZK on startup and initialize the default resource parent node.
  // Once ZK is ready and the node is created, 'ready' event will be emitted.
  zkClient.once('connected', () => {
    debug('Connected to ZooKeeper.');
    zkClient.create(opt.resourceName, null, zookeeper.CreateMode.PERSISTENT,
      (err) => {
        if (err) {
          if (err.getCode() !== zookeeper.Exception.NODE_EXISTS) {
            error('Unable to create resource', opt.resourceName, err);
            lockService.events.emit('error');
            return;
          } else {
            debug('reusing existing resource', opt.resourceName);
          }
        }

        lockService.events.emit('ready');
      });
  });

  zkClient.once('connectedReadOnly', () => {
    error('server is read-only');
  });
  zkClient.once('disconnected', () => {
    error('server connection has been disconnected');
  });
  zkClient.once('expired', () => {
    error('server connection has expired');
  });
  zkClient.once('authenticationFailed', () => {
    error('server authentication failed');
  });

  zkClient.connect();

  return lockService;
}

module.exports = createLockService;
