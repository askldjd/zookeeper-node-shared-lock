'use strict';

var zookeeper = require('node-zookeeper-client');
const async = require('async');
const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');
const m = {};

function lockAcquired(ctx) {
  debug('lock acquired');
  ctx.cb();
}

function lockFailed(ctx, err) {
  err = err || '';
  error('unable to aquire lock', err);
  ctx.cb('unable to aquire lock');
}

function create(ctx) {
  ctx.client.create(
    ctx.resource,
    null,
    zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
    (err, path) => {
      if (err) {
        return lockFailed(ctx, err);
      }
      debug('znode created', path);
      ctx.createdPath = path.split('/').pop();
      return getChildren(ctx);
    }
  );
}


function getChildren(ctx) {
  ctx.client.getChildren(
    '/__lock-node__',
    null,
    (err, children, stat) => {
      if (err) {
        debug('Failed to list children of %s due to: %s.', ctx.resource, err);
        return lockFailed(ctx, err);
      }

      let sorted = children.sort();
      debug('Children of %s are: %j.', ctx.resource, sorted);
      if (ctx.createdPath === sorted[0]) {
        return lockAcquired(ctx);
      } else {
        ctx.lastChildId = sorted[sorted.length - 2];
        return exists(ctx);
      }
    }
  );
}

function exists(ctx) {
  debug('step 3', ctx.lastChildId, ctx.createdPath);
  ctx.client.exists('/__lock-node__/' + ctx.lastChildId,
    (event) => {
      debug('got node event', event);
      if (event.name === 'NODE_DELETED') {
        return getChildren(ctx);
      }
    },

    (err, stat) => {
      if (err) {
        debug(error.stack);
        return lockFailed(ctx);
      }

      if (stat) {
        debug('Node exists.');
      } else {
        debug('Node does not exist.');
        return getChildren(ctx);
      }
    });
}


m.lock = (client, resource, cb) => {
  let ctx = {
    cb: cb,
    client: client,
    resource: resource
  }
  create(ctx);
}

module.exports = m;
