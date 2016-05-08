'use strict';

var zookeeper = require('node-zookeeper-client');
const async = require('async');
const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');
const m = {};

function lockAcquired(ctx) {
  debug('lock acquired');
  ctx.cb(null, ctx.basePath + '/' + ctx.seqZnode);
}

function lockFailed(ctx, err) {
  err = err || '';
  error('unable to aquire lock', err);
  ctx.cb('unable to aquire lock');
}

m.lock = (ctx) => {

  let path = ctx.resource.split('/');
  path.pop();
  ctx.basePath = path.join('/');

  ctx.client.create(
    ctx.resource,
    null,
    zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
    (err, path) => {
      if (err) {
        return lockFailed(ctx, err);
      }
      debug('znode created', path);
      ctx.seqZnode = path.split('/').pop();
      return getChildren(ctx);
    }
  );
}

m.unlock = (ctx) => {
  ctx.client.remove(ctx.resource, -1, (err) => {
    if (err) {
      debug('unlock failed', ctx.resource, err);
      return ctx.cb('unable to unlock resource', ctx.resource);
    }
    return ctx.cb();
  });
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
      if (ctx.seqZnode === sorted[0]) {
        return lockAcquired(ctx);
      } else {
        ctx.lastChildId = sorted[sorted.length - 2];
        return exists(ctx);
      }
    }
  );
}

function exists(ctx) {

  let watchFunc;
  if (!ctx.ttl) {
    watchFunc = () => {
      return getChildren(ctx);
    }
  }
  debug('step 3', ctx.lastChildId, ctx.seqZnode);
  ctx.client.exists('/__lock-node__/' + ctx.lastChildId,
    watchFunc,

    (err, stat) => {
      if (err) {
        debug(error.stack);
        return lockFailed(ctx);
      }

      if (stat) {
        if (ctx.ttl) {
          debug('Lock is still not available, retrying');
          setTimeout(() => {
            return getChildren(ctx);
          }, 500);
        }
      } else {
        debug('Node does not exist.');
        return getChildren(ctx);
      }
    });
}

module.exports = m;
