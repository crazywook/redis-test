import { expect } from 'chai'
import Redis from 'ioredis'

enum RefreshStatus {
  PENDING = 'pending',
}

describe('RedisLock', () => {
  let redis: Redis

  before(() => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
    });
  })

  it('redis 상태를 pending으로 만든다', () => {
    const mallId= 'gitple'

    const keeper = new Cafe24RefreshKeeper(redis);
    
    const statusKey = keeper.getKeyByMallId(mallId);
    redis.set(statusKey, 'pending', 'EX', 60 * 60 * 24)

    const status = redis.get(statusKey)
    expect(status).to.equal(RefreshStatus.PENDING)
  })

  it('')
})