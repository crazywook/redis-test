import { expect } from 'chai';
import Redis from 'ioredis';
import sinon from 'sinon';

import { Cafe24TokenManager } from '../src/cafe24/cafe24TokenManager';
import { Cafe24KeeperImpl } from '../src/cafe24lock';

const TEST_REDIS_DATABASE_INDEX = 15;

describe('redis lock test', () => {
  const redis = new Redis()
  redis.select(TEST_REDIS_DATABASE_INDEX)
  
  const cafe24Keeper = new Cafe24KeeperImpl(redis, 'cafe24')
  const lockByMallIdSpy = sinon.spy(cafe24Keeper, 'lockByMallId')
  
  async function initTestRedis() {
    await redis.del('cafe24:gitple');
  }

  function requestRefreshTokenMock() {
    return Promise.resolve({
      data: {
        access_token: 'access_token'
      }
    })
  }
  const dbLibMock = {} as any;

  beforeEach(async () => {
    // await initTestRedis();
  })

  after(async () => {
    // await initTestRedis();
  })

  it('cafe24 mallId로 락이 없으면 카페24 업데이트 가능이 true를 반환', async () => {
    await redis.del('cafe24:gitple');

    const mallId = 'gitple';
    const canUpdate = await cafe24Keeper.canUpdateCafe24(mallId);

    expect(canUpdate).to.be.true
  })

  it('cafe24 mallId로 락을 걸면 카페24 업데이트 가능이 false라는 값을 준다.', async () => {
    const mallId = 'gitple';
    await cafe24Keeper.lockByMallId(mallId);
    const canUpdate = await cafe24Keeper.canUpdateCafe24(mallId);

    expect(canUpdate).to.be.false
  })
  
  it('mallId에 락이 걸렸을 경우 cafe24 token 업데이트를 하면 3초후에 재시도를 한번 한다.', async () => {
    const config = {
      CAFE24_CLIENT_ID: 'cafe24ClientId',
      CAFE24_CLIENT_SECRET: 'cafe24',
    }
    const mallId = 'gitple';
    const refreshToken = 'refreshToken';
    const auth: string = `${config.CAFE24_CLIENT_ID}:${config.CAFE24_CLIENT_SECRET}`;
    
    const tokenManager = new Cafe24TokenManager(
      dbLibMock,
      {} as any,
      requestRefreshTokenMock,
      cafe24Keeper,
    );

    await cafe24Keeper.lockByMallId(mallId);
    lockByMallIdSpy.resetHistory();

    const result = await tokenManager.refreshCafe24TokenItemWithRetry({
      mallId,
      refreshToken,
      auth,
    }).catch(e => {})

    expect(lockByMallIdSpy.callCount).to.be.equal(2);
    expect(lockByMallIdSpy.calledWith(mallId)).to.be.true;
    console.log(tokenManager.createLockedErrorResult(mallId));
    expect(result).to.be.undefined;
  })

  it('mallId에 락이 안걸렸을 경우 cafe24 token 업데이트를 할 때 락을 건다.', async () => {
    const config = {
      CAFE24_CLIENT_ID: 'cafe24ClientId',
      CAFE24_CLIENT_SECRET: 'cafe24',
    }
    const mallId = 'gitple';
    const refreshToken = 'refreshToken';
    const auth: string = `${config.CAFE24_CLIENT_ID}:${config.CAFE24_CLIENT_SECRET}`;
    
    const tokenManager = new Cafe24TokenManager(
      dbLibMock,
      {} as any,
      requestRefreshTokenMock,
      cafe24Keeper,
    );

    const refreshResult = await tokenManager.refreshCafe24TokenItemWithRetry({
      mallId,
      refreshToken,
      auth,
    })

    console.log('=== error', refreshResult)
    expect(lockByMallIdSpy.calledWith(mallId)).to.be.true;
  })
})