'use strict'
const async = require('async');
const zookeeper = require('node-zookeeper-client');
const lockProtocol = require('./lock-protocol');
const EventEmitter = require('events').EventEmitter;

const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');

function createLockService(opt) {

  const zkClient = zookeeper.createClient('localhost:2181');
  const ZK_PATH = '/__lock-node__';

  let lockService = {};
  lockService.events = new EventEmitter();

  lockService.lock = (resource, ttl, cb) => {
    let ctx = {
      cb,
      client: zkClient,
      ttl,
      resource,
    }
    lockProtocol.lock(ctx);
  };

  lockService.extendTtl = (resource, ttl, cb) => {
    setImmediate(cb);
  };

  lockService.unlock = (resource, cb) => {
    let ctx = {
      cb,
      client: zkClient,
      resource,
    }
    lockProtocol.unlock(ctx);
  };


  zkClient.once('connected', () => {
    debug('Connected to ZooKeeper.');
    zkClient.create(ZK_PATH, null, zookeeper.CreateMode.PERSISTENT, (err) => {
      lockService.events.emit('ready');
    })
  });

  zkClient.connect();

  return lockService;
}

module.exports = createLockService;
