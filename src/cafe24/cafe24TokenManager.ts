import { StatusCodes } from 'http-status-codes';
import { Cafe24DbStatus, Cafe24Keeper, Cafe24OAuthTokenResult, RefreshResult } from '../types';
// import { DbLibInterface } from 'lib/types';
import _logger = require('winston');

const logger = _logger.createLogger({ transports: [new _logger.transports.Console()] });

export interface Cafe24Shop {
  shop_no: number;
  default: string;
  shop_name: string;
  business_country_code: string;
  language_code: string;
  language_name: string;
  currency_code: string;
  currency_name: string;
  reference_currency_code: string;
  reference_currency_name: string;
  pc_skin_no: number;
  mobile_skin_no: number;
  base_domain: string;
  primary_domain: string;
  slave_domain: any[];
  active: string;
  timezone: string;
  timezone_name: string;
  date_format: string;
  time_format: string;
  use_reference_currency: string;
}

export interface Shop {
  id: string;
  mallId?: string;
  shopNo?: number;
  accessToken? : {
    token: string;
    expire: Date;
  };
  refreshToken? : {
    token: string;
    expire: Date;
  };
  userId?: string;
  sp?: number;
  app?: number;
  scriptNo?: string;
  apiVersion?: string;
  status?: any;
}

const Cafe24RefreshTokenError = {} as any;
// import { Cafe24RefreshTokenError } from '../types';
// import { Cafe24OAuthTokenResult } from './types';

export class Cafe24TokenManager {
  static readonly RETRY_DELAY = 2000;
  static readonly RETRY_LIMIT = 1;

  constructor(
    private readonly repository: { getCafe24: (mallId: string) => Promise<Shop> },
    private readonly configLib: any,
    private readonly requestRefreshToken: (args: any) => Promise<{
      error: any;
      error_description?: string;
      statusCode: StatusCodes;
      code?: string;
      tokenItem: Cafe24OAuthTokenResult;
    }>,
    private readonly cafe24Keeper: Cafe24Keeper
  ) {}

  createLockedErrorResult(mallId: string) {
    return {
      error: {
        message: `${ mallId} was locked`,
      },
      tokenItem: null,
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
    }
  }

  async delayToGetCafe24(mallId: string) {
    await new Promise(resolve => {
      setTimeout(resolve, Cafe24TokenManager.RETRY_DELAY);
    });
    return this.repository.getCafe24(mallId);
  }

  async getAccessTokenWithRefreshToken(params: {
    mallId: string
    refreshToken: string
    cafe24Shops: any,
    reason: string,
  }): Promise<RefreshResult> {
    const { mallId, refreshToken } = params;
    const auth: string = `${this.configLib.get('cafe24.CAFE24_CLIENT_ID')}:${this.configLib.get('cafe24.CAFE24_CLIENT_SECRET')}`;

    const cafe24DbStatus = await this.cafe24Keeper.getCafe24DbStatusByMallId(mallId);

    if (cafe24DbStatus === Cafe24DbStatus.REFRESHING) {
      const shop = await this.delayToGetCafe24(mallId);

      return {
        tokenItem: shop.accessToken,
      }
    }

    const lockResult = await this.cafe24Keeper.setRefreshingByMallId(mallId);
    console.log('=== lockResult', lockResult)
    if (!lockResult) {
      logger.error(`[cafe24/getAccessTokenWithRefreshToken] - mallId: %s was locked.`, mallId);
      return this.createLockedErrorResult(mallId);
    }

    const result = await this.refreshCafe24TokenItemWithRetry(
      { mallId, refreshToken, auth },
      { limit: Cafe24TokenManager.RETRY_LIMIT, current: 0 }
    );

    if ('error' in result) {
      return result;
    }

    return result;
  }

  async refreshCafe24TokenItemWithRetry(
    params: {
      mallId: string
      refreshToken: string
      auth: string
    },
    retry: {
      limit: number
      current: number
    } = { limit: 1, current: 0 }
  ): Promise<{
    error: any
    error_description?: string,
    statusCode: StatusCodes
  } | {
    tokenItem: Cafe24OAuthTokenResult
  }> {
    if (retry.current > retry.limit) {
      logger.error(`[cafe24/refreshTokenApi] - stop retry refreshTokenApi() Error (${retry.current})`, params);
      throw new Error('stop refreshTokenApi');
    }

    const { mallId, refreshToken, auth } = params;

    try {
      const { statusCode, error, error_description, tokenItem } = await this.requestRefreshToken({ mallId, refreshToken, auth });
      if (statusCode !== StatusCodes.BAD_REQUEST || error !== Cafe24RefreshTokenError.INVALID_GRANT) {
        return { statusCode, error, error_description, tokenItem };
      }

      const dbCafe24 = await this.repository.getCafe24(mallId) as any;

      if (!dbCafe24 || !dbCafe24.refreshToken.token) {
        logger.error(`[cafe24/refreshTokenApi] - empty cafe24Item (${retry.current})`, mallId);
        throw new Error('empty cafe24Item');
      }

      const dbRefreshToken = dbCafe24.refreshToken.token;
      if (refreshToken !== dbRefreshToken ) {
        return { statusCode, error, tokenItem, error_description };
      }

      return this.refreshCafe24TokenItemWithRetry(
        { mallId, refreshToken: dbRefreshToken, auth },
        { limit: retry.limit, current: retry.current + 1 }
      );
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e;
      }
      logger.error(`[cafe24/refreshTokenApi] - refreshTokenApi() Error (${retry.current})`, params, e);
      throw new Error(`[cafe24/getCafe24TokenItem] - ${e.message}`);
    }
  }
}
