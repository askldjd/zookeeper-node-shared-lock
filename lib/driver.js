'use strict';

const async = require('async');
var zookeeper = require('node-zookeeper-client');
var zkClient = zookeeper.createClient('localhost:2181');

const createLockService = require('./lock-service');
const PATH = '/__lock-node__/lock-';

let opt = {};
let lockService = createLockService(opt);

lockService.events.on('ready', () => {
  lockService.lock(PATH, 0, () => {
    console.log('locked');
  });
});
