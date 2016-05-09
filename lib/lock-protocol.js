'use strict';

var zookeeper = require('node-zookeeper-client');
const debug = require('debug')('lock-service:debug');
const error = require('debug')('lock-service:error');

// Each TTL tick is 100ms. This is the multiplier used to map collision collisionCount
// to delay in milliseconds.
const TTL_TICK = 100;

const m = {};

function lockAcquired(ctx) {
  let acquiredPath = `${ctx.resourceName}/${ctx.seqZnode}`;
  debug('lock acquired', acquiredPath);
  ctx.cb(null, acquiredPath);
}

function lockFailed(ctx, err) {
  err = err || '';
  error('unable to acquire lock', err);

  // At this point, we have failed to obtain this lock. If we have created a
  // sequential znode before, we will need to clean it up.
  if (ctx.seqZnode) {
    let acquiredPath = `${ctx.resourceName}/${ctx.seqZnode}`;
    debug('lock failed, cleaning up existing sequential znode', acquiredPath);
    ctx.client.remove(acquiredPath, -1, () => {
      ctx.cb('unable to acquire lock');
    });
  } else {
    ctx.cb('unable to acquire lock');
  }
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
        error('unable to create ZNode', err);
        return lockFailed(ctx, 'unable to create ZNode');
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
  if (!ctx.acquiredResource) {
    return setImmediate(ctx.cb, 'resource can not be empty');
  }
  debug('removing', ctx.acquiredResource);
  ctx.client.remove(ctx.acquiredResource, -1, (err) => {
    if (err) {
      debug('unlock failed', ctx.acquiredResource, err);
      return ctx.cb('unable to unlock resource', ctx.acquiredResource);
    }
    debug('removed', ctx.acquiredResource);
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
    (err, children) => {
      if (err) {
        debug('Failed to list children of %s due to: %s.', ctx.resourceId,
          err);
        return lockFailed(ctx, 'Failed to list ZNode children');
      }

      // Sort all the children node, and we are only interested to see if
      // we are the lowest. If not, we need to monitor the next lowest.
      let sorted = children.sort();
      debug('Children of %s are: %j.', ctx.resourceName, sorted);
      if (ctx.seqZnode === sorted[0]) {
        return lockAcquired(ctx);
      } else {
        let index = sorted.findIndex((e) => {
          return e === ctx.seqZnode;
        });
        // lastChildId is the one that we are waiting for.
        ctx.lastChildId = sorted[index - 1];
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

  ctx.client.exists(`${ctx.resourceName}/${ctx.lastChildId}`,
    watchFunc,

    (err, stat) => {
      if (err) {
        error(
          `unable to check the existence of ${ctx.resourceName}/${ctx.lastChildId}`
        );
        return lockFailed(ctx,
          `unable to check the existence of ${ctx.resourceName}/${ctx.lastChildId}`
        );
      }

      if (stat) {

        // If lock owner uses TTL option, track the elapse time and calculate
        // the next TTL check. This implementation uses the binary exponential
        // backoff algorithm based on collision count.
        // https://en.wikipedia.org/wiki/Exponential_backoff
        if (ctx.ttl) {
          ctx.collisionCount = ctx.collisionCount || 0;
          ctx.totalElapsedTime = ctx.totalElapsedTime || 0;
          if (ctx.totalElapsedTime > ctx.ttl) {
            debug('Lock failed, ttl timed out', ctx.totalElapsedTime);
            return lockFailed(ctx,
              `'Lock failed, ttl timed out - ${ctx.totalElapsedTime}`);
          }

          let maxDelay = Math.pow(2, ctx.collisionCount) * TTL_TICK;

          let nextDelay = Math.floor((Math.random() * maxDelay));

          debug('Lock is still not available, retrying in', nextDelay);

          setTimeout(() => {
            ++ctx.collisionCount;
            ctx.totalElapsedTime += nextDelay;
            return getChildren(ctx);
          }, nextDelay);
        }
      } else {
        debug('Lock appears to be available, re-acquiring.');
        return getChildren(ctx);
      }
    });
}

module.exports = m;
