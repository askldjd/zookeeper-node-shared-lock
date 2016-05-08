'use strict';

var zookeeper = require('node-zookeeper-client');
const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');
const m = {};

function lockAcquired(ctx) {
  let acquiredPath = `${ctx.resourceName}/${ctx.seqZnode}`;
  debug('lock acquired', acquiredPath);
  ctx.cb(null, acquiredPath);
}

function lockFailed(ctx, err) {
  err = err || '';
  error('unable to acquire lock', err);
  ctx.cb('unable to acquire lock');
}

m.lock = (ctx) => {
  let resourcePath = `${ctx.resourceName}/${ctx.resourceId}`;

  // Attempt to lock the resource by calling "create()" on the resource path.
  // Once this finished, a ephemeral sequential node should be created.
  ctx.client.create(
    resourcePath,
    null,
    zookeeper.CreateMode.EPHEMERAL_SEQUENTIAL,
    (err, path) => {
      if (err) {
        return lockFailed(ctx, err);
      }
      debug('znode created', path);

      // seqZnode is the node that has been created. Next, we need to check if
      // this node has the lowest sequence among all children.
      ctx.seqZnode = path.split('/').pop();
      return getChildren(ctx);
    }
  );
};

m.unlock = (ctx) => {
  ctx.client.remove(ctx.acquiredResource, -1, (err) => {
    if (err) {
      debug('unlock failed', ctx.acquiredResource, err);
      return ctx.cb('unable to unlock resource', ctx.acquiredResource);
    }
    return ctx.cb();
  });
};


function getChildren(ctx) {

  // Get all the children of the parent ephemeral node. This is essentially the
  // resource name path. If the seqZnode is the lowest node, then we have
  // successfully acquired the lock. Otherwise, we need to wait in line and see
  // if the "next lowest" node is gone.
  ctx.client.getChildren(
    ctx.resourceName,
    null,
    (err, children, stat) => {
      if (err) {
        debug('Failed to list children of %s due to: %s.', ctx.resourceId, err);
        return lockFailed(ctx, err);
      }

      // Sort all the children node, and we are only interested to see if
      // we are the lowest. If not, we need to monitor the next lowest.
      let sorted = children.sort();
      debug('Children of %s are: %j.', ctx.resource, sorted);
      if (ctx.seqZnode === sorted[0]) {
        return lockAcquired(ctx);
      } else {
        // lastChildId is the one that we are waiting for.
        ctx.lastChildId = sorted[sorted.length - 2];
        return exists(ctx);
      }
    }
  );
}

function exists(ctx) {

  let watchFunc;

  // If there is no TTL, then we can use a watch function to wait permanantly
  // for the next lowest node to be freed. Otherwise, we will poll with a
  // double-backoff timer.
  if (!ctx.ttl) {
    watchFunc = () => {
      return getChildren(ctx);
    };
  }
  debug('step 3', ctx.lastChildId, ctx.seqZnode);
  ctx.client.exists(`${ctx.resourceName}/${ctx.lastChildId}`,
    watchFunc,

    (err, stat) => {
      if (err) {
        debug(error.stack);
        return lockFailed(ctx);
      }

      if (stat) {
        if (ctx.ttl) {
          ctx.ttlCounter = ctx.ttlCounter || 0;
          let totalElapsedTime = (Math.pow(2, ctx.ttlCounter + 1) - 2) * 100;
          if (totalElapsedTime > ctx.ttl) {
            debug('Lock failed, ttl timed out', totalElapsedTime);
            return lockFailed(ctx);
          }
          let nextDelay = Math.pow(2, ctx.ttlCounter) * 100;
          debug('Lock is still not available, retrying in', nextDelay);

          setTimeout(() => {
            ++ctx.ttlCounter;
            return getChildren(ctx);
          }, nextDelay);
        }
      } else {
        debug('Node does not exist.');
        return getChildren(ctx);
      }
    });
}

module.exports = m;
