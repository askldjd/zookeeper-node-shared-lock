'use strict';

const async = require('async');
var zookeeper = require('node-zookeeper-client');
var zkClient = zookeeper.createClient('localhost:2181');

const lockService = require('./lock-service');
const PATH = '/__lock-node__/lock-';

zkClient.once('connected', function() {
  console.log('Connected to ZooKeeper.');
  async.series([
    function(cb) {
      zkClient.create('/__lock-node__', null, zookeeper.CreateMode.PERSISTENT, function(err) {
        cb();
      })
    },
    function(cb) {
      lockService.lock(zkClient, PATH, () => {
        console.log('locked');
      });
    }
  ], function(err) {
    console.log('all done');
  })

});

zkClient.connect();
