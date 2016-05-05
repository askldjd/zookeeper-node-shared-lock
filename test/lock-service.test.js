'use strict';

const async = require('async');
var zookeeper = require('node-zookeeper-client');
var zkClient = zookeeper.createClient('localhost:2181');

const createLockService = require('../lib/lock-service');
const PATH = '/__lock-node__/myresource';

describe('', function() {

  let lockService;
  let acquiredResource;
  it('create lock service', function(done) {
    let opt = {};
    lockService = createLockService(opt);

    lockService.events.on('ready', () => {
      done();
    });
  });

  it('lock a resource', function(done) {
    lockService.lock(PATH, 0, (err, resource) => {
      acquiredResource = resource;
      done();
    });
  });

  it('unlock a resource', function(done) {
    console.log('acquired resource is', acquiredResource);
    lockService.unlock(acquiredResource, (err) => {
      done();
    });
  });
});
