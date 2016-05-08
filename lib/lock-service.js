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

  const zkClient = zookeeper.createClient(`${opt.host}:${opt.port}`);
  let lockService = {};
  lockService.events = new EventEmitter();

  lockService.lock = (resourceId, ttl, cb) => {
    cb = cb || function() {};
    let ctx = {
      cb,
      client: zkClient,
      ttl,
      resourceName: opt.resourceName,
      resourceId
    };
    lockProtocol.lock(ctx);
  };

  lockService.unlock = (acquiredResource, cb) => {
    cb = cb || function() {};
    let ctx = {
      cb,
      client: zkClient,
      resourceName: opt.resourceName,
      acquiredResource
    };
    lockProtocol.unlock(ctx);
  };

  zkClient.once('connected', () => {
    debug('Connected to ZooKeeper.');
    zkClient.create(opt.resourceName, null, zookeeper.CreateMode.PERSISTENT, (err) => {
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
