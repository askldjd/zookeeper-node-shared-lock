'use strict';

const createLockService = require('../lib/lock-service');
const RESOURCE_ID = 'myresource';
const expect = require('expect');

describe('Lock Service test suite', function() {

  describe('Simple Lock Unlock Test', function() {

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
      lockService.lock(RESOURCE_ID, 0, (err, resource) => {
        expect(err).toBeFalsy();
        expect(resource).toBeTruthy();
        acquiredResource = resource;
        done();
      });
    });

    it('unlock a resource', function(done) {
      lockService.unlock(acquiredResource, (err) => {
        expect(err).toBeFalsy();
        done();
      });
    });
  });

  describe('Simple Lock with Unlock TTL Test', function() {

    let lockService;
    it('create lock service', function(done) {
      let opt = {};
      lockService = createLockService(opt);

      lockService.events.on('ready', () => {
        done();
      });
    });

    it('lock a resource and wait for TTL expiration', function(done) {
      lockService.events.on('ttlExpired', (resourceId) => {
        expect(resourceId).toBeTruthy();
        done();
      });
      lockService.lock(RESOURCE_ID, 500, (err, lockCtx) => {
        expect(err).toBeFalsy();
        expect(lockCtx).toBeTruthy();
      });
    });
  });

  function makeTwoLockTest(opt) {
    return function() {
      let lockService;
      let acquiredResource;
      it('create lock service', function(done) {
        lockService = createLockService(opt);

        lockService.events.on('ready', () => {
          done();
        });
      });

      it('lock a resource', function(done) {
        lockService.lock(RESOURCE_ID, 0, (err, resource) => {
          acquiredResource = resource;
          done();
        });
      });

      it('lock contention, need to wait 2 sec before acquiring', function(
        done) {
        this.timeout(10000);
        lockService.lock(RESOURCE_ID, 0, (err, resource) => {
          acquiredResource = resource;
          done();
        });

        setTimeout(() => {
          lockService.unlock(acquiredResource, (err) => {
            expect(err).toBeFalsy();
          });
        }, 2000);
      });

      it('unlock the resource', function(done) {
        lockService.unlock(acquiredResource, (err) => {
          expect(err).toBeFalsy();
          done();
        });
      });
    };
  }

  describe('Two-lock Test with watch', makeTwoLockTest({
    maxRetryCount: 0
  }));

  describe('Two-lock Test with periodic poll',
    makeTwoLockTest({
      maxRetryCount: 5000
    }));

  describe('Two-lock Test with retry count failure', function() {
    let lockService;
    let acquiredResource;
    it('create lock service', function(done) {
      let opt = {
        maxRetryCount: 1
      };
      lockService = createLockService(opt);

      lockService.events.on('ready', () => {
        done();
      });
    });

    it('lock a resource', function(done) {
      lockService.lock(RESOURCE_ID, 0, (err, resource) => {
        acquiredResource = resource;
        done();
      });
    });

    it('lock contention, need to wait 2 sec before acquiring', function(
      done) {
      this.timeout(4000);
      lockService.lock(RESOURCE_ID, 0, (err) => {
        expect(err).toBeTruthy();
        done();
      });
    });

    it('unlock the resource', function(done) {
      lockService.unlock(acquiredResource, (err) => {
        expect(err).toBeFalsy();
        done();
      });
    });
  });

  // N-Contenders for a single resource, and lock hold must be released manually.
  function makeNLockTestWithManualTtl(opt) {
    return function() {

      let lockService;
      it('create lock service', function(done) {
        lockService = createLockService(opt);

        lockService.events.on('ready', () => {
          done();
        });
      });

      it('lock a resource', function(done) {
        this.timeout(opt.manualTtl * opt.numContention * 10);
        let acquired = 0;
        for (let i = 0; i < opt.numContention; ++i) {
          lockService.lock(RESOURCE_ID, 0, (err, resource) => {
            expect(err).toBeFalsy();
            ++acquired;
            setTimeout(() => {
              lockService.unlock(resource, (err) => {
                expect(err).toBeFalsy();
                if (acquired === opt.numContention) {
                  done();
                }
              });
            }, opt.manualTtl);
          });
        }
      });
    };
  }

  // N-Contenders for a single resource, and lock hold will be released automatically
  function makeNLockTestWithAutoTtl(opt) {
    return function() {

      let lockService;
      it('create lock service', function(done) {
        lockService = createLockService(opt);

        lockService.events.on('ready', () => {
          done();
        });
      });

      it('lock a resource and wait for TTL expiration', function(done) {
        this.timeout(opt.ttl * opt.numContention * 10);
        let completed = 0;
        lockService.events.on('ttlExpired', (resourceId) => {
          expect(resourceId).toBeTruthy();
          ++completed;
          if (completed === opt.numContention) {
            done();
          }
        });
        for (let i = 0; i < opt.numContention; ++i) {
          lockService.lock(RESOURCE_ID, opt.ttl, (err, lockCtx) => {
            expect(err).toBeFalsy();
            expect(lockCtx).toBeTruthy();
          });
        }
      });
    };
  }

  describe('N-lock Test with manual TTL and watch',
    makeNLockTestWithManualTtl({
      manualTtl: 500,
      numContention: 50,
      maxRetryCount: 0
    }));

  describe('N-lock Test with manual TTL and periodic poll',
    makeNLockTestWithManualTtl({
      manualTtl: 500,
      numContention: 5,
      maxRetryCount: 100000000
    }));

  describe('N-lock Test with auto TTL and watch',
    makeNLockTestWithAutoTtl({
      ttl: 500,
      numContention: 50,
      maxRetryCount: 0
    }));

  describe('N-lock Test with auto TTL and periodic poll',
    makeNLockTestWithAutoTtl({
      ttl: 500,
      numContention: 5,
      maxRetryCount: 100000000
    }));
});
