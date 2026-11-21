/**
 * 云函数调用层。
 *
 * 为什么有这一层
 * ---------------------------------------------------------------------------
 * 之前端上直连数据库函数并自己传 `p_member_id` / `p_openid` —— 身份由客户端申报，
 * 任何人改参数就能变成管理员（安全文档 intend-s.md 的 SEC-01）。
 * 现在私有调用一律经云函数 `rockgym-api`，身份只认服务端签发的 token。
 *
 * 端上在这里只做三件事：注入 token、解析响应、把错误码翻译成人话。
 * **不做任何业务判定** —— 判定在数据库函数里（安全决议 S1）。
 */
// 与 services/db.ts 一致：走内置的相对路径产物，而不是包名。
// 用包名必须先「构建 npm」生成 miniprogram_npm，否则小程序会报
// module 'services/@cloudbase/js-sdk.js' is not defined。
import { API_BASE, API_PATH } from './config';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message || code);
    this.code = code;
    this.status = status;
  }

  /** 身份失效：上层应清 token 重新登录，而不是让用户反复重试 */
  get unauthorized(): boolean {
    return this.code === 'UNAUTHORIZED' || this.status === 401;
  }
}

interface Envelope<T> {
  code: string;
  message?: string;
  data?: T;
}

/**
 * 调用云函数。
 *
 * 返回值是函数内部 `ok(data)` 的 `data`；非 OK 一律抛 ApiError ——
 * **不静默返回空数据**，否则页面会显示"没有数据"而不是"出了错"。
 */
export async function callApi<T>(
  action: string,
  params: Record<string, unknown> = {},
  token = '',
): Promise<T> {
  // 走 HTTP 访问服务的 /api 路由，而不是 SDK 的 callFunction：
  // 后者这条通道已被环境拒（EXCEED_AUTHORITY），详见 config.ts 的 API_BASE 注释。
  let payload: Envelope<T> | null = null;
  let status = 0;

  try {
    const res = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult>(
      (resolve, reject) => {
        wx.request({
          url: `${API_BASE}${API_PATH}`,
          method: 'POST',
          header: { 'content-type': 'application/json' },
          data: { ...params, action, token },
          success: (r) => resolve(r),
          fail: (e) => reject(new Error(e.errMsg || '网络请求失败')),
        });
      },
    );
    status = res.statusCode;
    payload = res.data as Envelope<T> | null;
  } catch (e) {
    const err = e as { errMsg?: string; message?: string };
    throw new ApiError('CALL_FAILED', err.errMsg || err.message || '云函数调用失败');
  }

  if (!payload) throw new ApiError('BAD_RESPONSE', `云函数返回无法解析（HTTP ${status}）`);
  if (payload.code !== 'OK') {
    throw new ApiError(payload.code, payload.message || payload.code, status);
  }
  return payload.data as T;
}

/** 通道自检：不碰数据库，只看云函数是否可达、token/演示开关状态 */
export interface PingResult {
  status: string;
  demoMode: boolean;
  tokenReady: boolean;
  wxLoginReady: boolean;
  serverTime: string;
}

export async function ping(): Promise<PingResult> {
  return callApi<PingResult>('ping');
}
