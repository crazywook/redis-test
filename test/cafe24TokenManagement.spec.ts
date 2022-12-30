import { expect } from 'chai';
import { StatusCodes } from 'http-status-codes';
import Redis from 'ioredis';
import sinon from 'sinon';

import { Cafe24Shop, Cafe24TokenManager, Shop } from '../src/cafe24/cafe24TokenManager';
import { Cafe24KeeperImpl } from '../src/cafe24lock';
import { Cafe24DbStatus, Cafe24OAuthTokenResult } from '../src/types';

const TEST_REDIS_DATABASE_INDEX = 15;

describe('cafe24 token management', () => {
  const redis = new Redis()
  redis.select(TEST_REDIS_DATABASE_INDEX)
  
  const cafe24Keeper = new Cafe24KeeperImpl(redis, 'cafe24')
  const lockByMallIdSpy = sinon.spy(cafe24Keeper, 'lockByMallId')
  const setRefreshingByMallIdSpy = sinon.spy(cafe24Keeper, 'setRefreshingByMallId')
  
  const mallId = 'gitple';
  const refreshToken = 'refreshToken';
  const reason = 'test';

  const sandbox = sinon.createSandbox();
  
  const cafe24Repository = {
    getCafe24: sandbox.stub()
  }
  
  cafe24Repository.getCafe24.resolves({
    id: 'abc',
    mallId,
    shopNo: 1,
    accessToken: {
      token: 'access_token',
      expire: new Date('2020-01-01'),
    },
    refreshToken: {
      token: 'refresh_token',
      expire: new Date('2020-01-01'),
    }
  }
  )
  const configLibMock = {
    get(path: string) {
      if (path === 'CAFE24_CLIENT_ID') {
        return 'CAFE24_CLIENT_ID'
      } else if (path === 'CAFE24_CLIENT_SECRET') {
        return 'CAFE24_CLIENT_SECRET'
      }
    }
  } as any;

  const requestRefreshTokenMock = sandbox.stub<
    [],
    Promise<{
      error: any;
      error_description?: string;
      statusCode: StatusCodes;
      code?: string;
      tokenItem: Cafe24OAuthTokenResult,
    }>
  >();
  requestRefreshTokenMock.resolves({
    error: {},
    statusCode: StatusCodes.OK,
    tokenItem: {
      access_token: 'access_token',
      expires_at: new Date(),
      refresh_token: 'refresh_token',
      refresh_token_expires_at: new Date(),
      client_id: 'client_id',
      mall_id: 'mall_id',
      user_id: 'user_id',
      scopes: ['scope'],
      issued_at: 'issued_at',
    }
  })

  const tokenManager = new Cafe24TokenManager(
    cafe24Repository,
    configLibMock,
    requestRefreshTokenMock,
    cafe24Keeper,
  )

  const delayToGetCafe24Stub = sandbox.stub(tokenManager, 'delayToGetCafe24');
  delayToGetCafe24Stub.resolves({
    id: 'abc',
    accessToken: {
      token: 'access_token',
      expire: new Date(),
    }
  })
  const refreshCafe24TokenItemWithRetryMock = sandbox.stub(tokenManager, 'refreshCafe24TokenItemWithRetry');
  refreshCafe24TokenItemWithRetryMock.resolves({
    error: {},
    statusCode: StatusCodes.OK,
    tokenItem: {
      access_token: 'access_token',
      expires_at: new Date(),
      refresh_token: 'refresh_token',
      refresh_token_expires_at: new Date(),
      client_id: 'client_id',
      mall_id: 'mall_id',
      user_id: 'user_id',
      scopes: ['scope'],
      issued_at: 'issued_at',
    }
  })

  async function initTestRedis() {
    await redis.del('cafe24:gitple');
  }

  const dbLibMock = {} as any;

  beforeEach(async () => {
    await initTestRedis();
    sandbox.resetHistory();
    // requestRefreshTokenMock.resetHistory();
  })

  after(async () => {
    await initTestRedis();
  })

  // it('cafe24 mallId로 락이 없으면 카페24 업데이트 가능이 true를 반환', async () => {
  //   const mallId = 'gitple';
  //   cafe24Keeper.setRefreshingByMallId
  //   const setResult = await cafe24Keeper.setRefreshingByMallId(mallId);
  //   expect(setResult).to.equals('OK')

  //   const getResult = await cafe24Keeper.getCafe24DbStatusByMallId(mallId);
  //   expect(getResult).to.equal(Cafe24DbStatus.REFRESHING)
  // })

  // it('cafe24DbStatus가 refreshing이라면 retry를 하지 않는다.', async () => {
  //   const config = {
  //     CAFE24_CLIENT_ID: 'cafe24ClientId',
  //     CAFE24_CLIENT_SECRET: 'cafe24',
  //   }
    
  //   const auth: string = `${config.CAFE24_CLIENT_ID}:${config.CAFE24_CLIENT_SECRET}`;
    
  //   await cafe24Keeper.setRefreshingByMallId(mallId);
  //   setRefreshingByMallIdSpy.resetHistory();

  //   const result = await tokenManager.refreshCafe24TokenItemWithRetry({
  //     mallId,
  //     refreshToken,
  //     auth,
  //   }).catch(e => {})

  //   expect(setRefreshingByMallIdSpy.callCount).to.be.equal(0);
  //   expect(requestRefreshTokenMock.notCalled).to.be.true;
  // })

  it('cafe24DbStatus가 refreshing이면 2초 기다린후 db에서 토큰을 가져온다.', async () => {

    await cafe24Keeper.setRefreshingByMallId(mallId);
    setRefreshingByMallIdSpy.resetHistory();

    console.log('=== tokenManager.getAccessTokenWithRefreshToken', tokenManager.getAccessTokenWithRefreshToken)
    await tokenManager.getAccessTokenWithRefreshToken({
      mallId,
      refreshToken,
      cafe24Shops: [],
      reason,
    }).catch(e => {
      console.error(e);
      expect.fail(e.message)
    })

    expect(setRefreshingByMallIdSpy.notCalled).to.be.true;
    expect(delayToGetCafe24Stub.calledOnceWith(mallId)).to.be.true;
  })

  it('cafe24DbStatus가 없다면 락을 걸고 토큰 리프레쉬를 한다.', async () => {

    await tokenManager.getAccessTokenWithRefreshToken({
      mallId,
      refreshToken,
      cafe24Shops: [],
      reason,
    }).catch(e => {
      console.error(e);
      expect.fail(e.message)
    })

    expect(delayToGetCafe24Stub.notCalled).to.be.true;
    expect(setRefreshingByMallIdSpy.calledOnceWith(mallId)).to.be.true;
    expect(cafe24Repository.getCafe24.notCalled).to.be.true;
    expect(refreshCafe24TokenItemWithRetryMock.calledOnce).to.be.true;

  })

  it('[refreshCafe24TokenItemWithRetry] dbCafe cafe24 token 업데이트를 할 때 락을 건다.', async () => {
    const config = {
      CAFE24_CLIENT_ID: 'cafe24ClientId',
      CAFE24_CLIENT_SECRET: 'cafe24',
    }
    const mallId = 'gitple';
    const refreshToken = 'refreshToken';
    const auth: string = `${config.CAFE24_CLIENT_ID}:${config.CAFE24_CLIENT_SECRET}`;

    refreshCafe24TokenItemWithRetryMock.restore();
    const refreshResult = await tokenManager.refreshCafe24TokenItemWithRetry({
      mallId,
      refreshToken,
      auth,
    })

    console.log('=== error', refreshResult)
    expect(lockByMallIdSpy.calledWith(mallId)).to.be.true;
  })
})