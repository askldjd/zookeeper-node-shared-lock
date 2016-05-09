'use strict';

const createLockService = require('../lib/lock-service');
const RESOURCE_ID = 'myresource';
const expect = require('expect');

describe('', function() {

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

  function makeTwoLockTest(opt) {
    return function() {
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
        lockService.lock(RESOURCE_ID, opt.ttl, (err, resource) => {
          acquiredResource = resource;
          done();
        });
      });

      it('lock contention, need to wait 2 sec before acquiring', function(
        done) {
        this.timeout(10000);
        lockService.lock(RESOURCE_ID, opt.ttl, (err, resource) => {
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

  describe('Two-lock Test with infinite wait', makeTwoLockTest({
    ttl: 0
  }));

  describe('Two-lock Test with TTL', makeTwoLockTest({
    ttl: 5000
  }));

  describe('Two-lock Test with TTL failure', function() {
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
      lockService.lock(RESOURCE_ID, 500, (err, resource) => {
        acquiredResource = resource;
        done();
      });
    });

    it('lock contention, need to wait 2 sec before acquiring', function(
      done) {
      this.timeout(4000);
      lockService.lock(RESOURCE_ID, 500, (err) => {
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

  function makeNLockTest(opt) {
    return function() {

      let lockService;
      it('create lock service', function(done) {
        let opt = {};
        lockService = createLockService(opt);

        lockService.events.on('ready', () => {
          done();
        });
      });

      it('lock a resource', function(done) {
        this.timeout(opt.lockHoldTimeMs * opt.numContention * 10);
        let acquired = 0;
        for (let i = 0; i < opt.numContention; ++i) {
          lockService.lock(RESOURCE_ID, opt.ttl, (err, resource) => {
            expect(err).toBeFalsy();
            ++acquired;
            setTimeout(() => {
              lockService.unlock(resource, (err) => {
                expect(err).toBeFalsy();
                if (acquired === opt.numContention) {
                  done();
                }
              });
            }, opt.lockHoldTimeMs);
          });
        }
      });
    };
  }


  describe('N-lock Test', makeNLockTest({
    lockHoldTimeMs: 500,
    numContention: 50,
    ttl: 0
  }));

  describe('N-lock Test with TTL', makeNLockTest({
    lockHoldTimeMs: 500,
    numContention: 5,
    ttl: 100000000
  }));

});
