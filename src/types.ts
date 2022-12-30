import { StatusCodes } from "http-status-codes";

export enum Cafe24DbStatus {
  REFRESHING = 'REFRESHING',
}
export interface Cafe24Keeper {
  getKeyByMallId(mallId: string): string;
  getCafe24DbStatusByMallId(mallId: string): Promise<Cafe24DbStatus | null>;
  canUpdateCafe24(mallId: string): Promise<boolean>;
  lockByMallId(mallId: string): Promise<string | null>;
  setRefreshingByMallId(mallId: string): Promise<string | null>;
}

export interface RefreshResult {
  error?: any
  error_description?: string,
  tokenItem?: any // Cafe24OAuthTokenResult
  statusCode?: StatusCodes
}

export interface Cafe24OAuthTokenResult {
  access_token: string;
  expires_at: Date;
  refresh_token: string;
  refresh_token_expires_at: Date;
  client_id: string;
  mall_id: string;
  user_id: string;
  scopes: string[];
  issued_at: string;
}
