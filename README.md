Clients wishing to obtain a lock do the following:

1. Call `create()` with a pathname of "_locknode_/guid-lock-" and the sequence and ephemeral flags set. The guid is needed in case the `create()` result is missed.

1. Call `getChildren()` on the lock node without setting the watch flag (this is important to avoid the herd effect).

1. If the pathname created in step 1 has the lowest sequence number suffix, the client has the lock and the client exits the protocol.

1. The client calls `exists()` with the watch flag set on the path in the lock directory with the next lowest sequence number.

1. if `exists()` returns false, go to step 2. Otherwise, wait for a notification for the pathname from the previous step before going to step 2.
The unlock protocol is very simple: clients wishing to release a lock simply delete the node they created in step 1.
