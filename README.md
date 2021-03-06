# zookeeper-node-shared-lock

This library implements a distributed global lock in Node.js using Zookeeper. The lock protocol is a variant of the [Zookeeper recipe](https://zookeeper.apache.org/doc/r3.3.5/recipes.html#sc_recipes_Locks).

The library is only suitable for educational references, and should not be used directly in production.

## API

### Creation
`zookeeper-node-shared-lock` returns a factory function that creates a lock service. The
function expects a set of configuration options. Once the service is created, you may subscribe to the `ready` event. Once the `ready` event is fired, you may begin locking/unlocking resources.

#### Parameters
The configuration parameters includes the following:
 - `host` - The hostname or IP of the zookeeper service.
 - `port` - The port number of zookeeper service.
 - `resourceName` - The name of the resource. Internally, this will be used as the parent ephemeral znode that holds all the child nodes.
 - `maxRetryCount` - The maximum number of times the lock will retry after request timeout. By default, this value is 0, which implies we will wait indefinitely for this resource.
 - `initialRetryWaitMs` - The amount of time to wait after initial failure. As failures accumulates, the retry wait will increase using the [binary exponential backoff](https://en.wikipedia.org/wiki/Exponential_backoff) algorithm. This value has no effect if `maxRetryCount` is 0.

#### Sample

```js
const lockService = require('zookeeper-node-shared-lock')({
  resourceName: 'my_global_resource', // the name of the resource
  host: 'localhost', // default: localhost
  port: 2181 // default: 2181
});

lockService.events.on('ready', () => {

  lockService.lock('resource1', 0, (err, acquiredResource) => {
    console.log('resource locked');

    lockService.unlock(acquiredResource, (err) => {
      console.log('resource unlocked');
    });
  });
});
```

### lock(resourceId, ttl, [cb])

`lock` acquires a resource asynchronously. The `resourceId` is the shared resource to lock. If the shared resource is acquired, or failed to be acquired, the `cb(err, acquiredResource)` will be invoked.

The return `acquiredResource` argument is used to `unlock` the acquired resource.

If `ttl` (in milliseconds) is provided, the lock service will automatically release the lock upon TTL expiration. User may subscribe to the `ttlExpired` event for this notification.

If `ttl` is 0 (default), the acquired lock resource will be held indefinitely.

### unlock(acquiredResource, [cb])

`unlock` releases the acquired resource asynchronously. The `acquiredResource` is the acquired resource returned from `lock`.


## Events

- `ready` - fired when Lock Service is ready.
- `ttlExpired` - fired with `function (resourceId)` if a resource is being forcefully released.
- `disconnected` - fired when we lost connection to Zookeeper

## ZooKeeper Lock Recipe

Clients wishing to obtain a lock do the following:

1. Call `create()` with a pathname of "_locknode_/guid-lock-" and the sequence and ephemeral flags set. The guid is needed in case the `create()` result is missed.

1. Call `getChildren()` on the lock node without setting the watch flag (this is important to avoid the herd effect).

1. If the pathname created in step 1 has the lowest sequence number suffix, the client has the lock and the client exits the protocol.

1. The client calls `exists()` with the watch flag set on the path in the lock directory with the next lowest sequence number.

1. if `exists()` returns false, go to step 2. Otherwise, wait for a notification for the pathname from the previous step before going to step 2.
The unlock protocol is very simple: clients wishing to release a lock simply delete the node they created in step 1.
