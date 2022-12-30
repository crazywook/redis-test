import type Redis from 'ioredis';
import { Cafe24DbStatus, Cafe24Keeper } from './types';


export class Cafe24KeeperImpl implements Cafe24Keeper {
  private redis: Redis;
  private key: string;

  constructor(redis: Redis, key: string) {
    this.redis = redis;
    this.key = key;
  }

  getKeyByMallId(mallId: string) {
    return `cafe24:${mallId}`;
  }

  async getCafe24DbStatusByMallId(mallId: string): Promise<Cafe24DbStatus | null> {
    const key = this.getKeyByMallId(mallId);
    const result = await this.redis.get(key);
    return result as any as Cafe24DbStatus;
  }

  async canUpdateCafe24(mallId: string) {
    const key = this.getKeyByMallId(mallId);
    const value = await this.redis.get(key)
    
    console.log('=== canUpdateCafe24 value', value)
    return !value;
  }

  async checkAndLockCafe24(mallId: string) {
    const value = await this.getCafe24DbStatusByMallId(mallId)

    if (!value) {
      return this.setRefreshingByMallId(mallId)
    }
    return value;
  }

  public async setRefreshingByMallId(mallId: string) {
    const key = this.getKeyByMallId(mallId);
    const lockResult = await this.redis.set(key, Cafe24DbStatus.REFRESHING, 'NX')
    return lockResult;
  }

  public async lockByMallId(mallId: string) {
    const key = this.getKeyByMallId(mallId);
    const lockResult = await this.redis.set(key, 'cafe', 'NX')
    console.log('=== lock result', lockResult)
    return lockResult;
  }

  public getLockByMallId(mallId: string) {
    return `${this.key}:${mallId}`;
  }
}
