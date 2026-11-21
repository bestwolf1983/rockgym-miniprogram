/**
 * 会员与员工身份。
 *
 * ⚠️ 这是整个客户端最重要的**信任边界**：客户端传来的身份一律不可信。
 *
 * 为什么单独成文件
 * ---------------------------------------------------------------------------
 * `rg_home(p_member_id)` 这类函数按 memberId 返回会员私有数据（会员卡、剩余次数、
 * 消费台账、准入状态）。如果 memberId 任由客户端填写，用户改一个参数就能看到
 * 别人的全部数据 —— 这是典型的越权（IDOR）。
 *
 * 生产接入方式（改动只应落在本文件）
 * ---------------------------------------------------------------------------
 *   1. 小程序 `wx.login()` 取 code
 *   2. code 送服务端（云函数 rockgym-api），由服务端换 openid —— AppSecret 不出服务端
 *   3. 服务端按 openid 查出/建立 member 或 staff 记录，**签发短期 token**
 *   4. 客户端持有 token；此后所有私有调用都带 token，
 *      **身份由服务端从 token 解析**，客户端不再申报"我是谁"
 *
 * 演示阶段：白名单 + 演示 token（DEMO_MODE），token 由服务端签发、同样校验签名。
 * 演示路径与真实路径共用一套校验，只是签发来源不同 —— 避免"演示绕过校验"。
 */
import { DEMO_MODE } from './config';
import { callApi } from './gateway';

/** 演示会员白名单 —— 与 H5 demo 一致 */
export const DEMO_MEMBERS = ['mb_nico', 'mb_pend', 'mb_exp', 'mb_new'] as const;

export type DemoMember = (typeof DEMO_MEMBERS)[number];

export type IdentityKind = 'member' | 'staff';

export interface Session {
  token: string;
  kind: IdentityKind;
  /** 会员 ID（kind=member） */
  memberId: string;
  /** 员工 openid（kind=staff） */
  openid: string;
  demo: boolean;
  /** 过期时间（秒） */
  exp: number;
}

const KEY_MEMBER = 'rg_token_member';
const KEY_STAFF = 'rg_token_staff';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** base64url → JSON。payload 只含 ASCII 字段，逐字节拼字符串即可 */
function decodePayload(token: string): any {
  const b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
  const arr = new Uint8Array(wx.base64ToArrayBuffer(b64));
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return JSON.parse(str);
}

function toSession(token: string): Session | null {
  try {
    const p = decodePayload(token);
    if (!p || !p.exp || p.exp * 1000 <= Date.now()) return null;
    return {
      token,
      kind: p.kind,
      memberId: p.mid || '',
      openid: p.openid || '',
      demo: !!p.demo,
      exp: p.exp,
    };
  } catch {
    return null;
  }
}

function read(key: string): Session | null {
  const token = wx.getStorageSync(key);
  if (!token || typeof token !== 'string') return null;
  const s = toSession(token);
  if (!s) wx.removeStorageSync(key); // 过期即清，不把废 token 留在本地
  return s;
}

function save(key: string, token: string): Session {
  wx.setStorageSync(key, token);
  return toSession(token)!;
}

/**
 * 把客户端传入的 id 收敛为合法身份（仅白名单）。
 * 直连模式（GATEWAY_MODE=direct）下仍用它兜底；网关模式不使用。
 */
export function normalizeMember(id?: string): DemoMember {
  return (DEMO_MEMBERS as readonly string[]).includes(id ?? '')
    ? (id as DemoMember)
    : 'mb_nico';
}

/**
 * 取当前会员 ID（直连模式兜底）。
 *
 * 网关模式下不应再走这里 —— 身份由服务端 token 决定。
 * 保留它是因为 `GATEWAY_MODE=direct` 这条演示回退路径还需要它。
 */
export function resolveMemberId(input?: string): string {
  if (!DEMO_MODE) {
    throw new Error(
      '生产模式未接入登录：memberId 必须由服务端从 openid 推导后下发（见 services/identity.ts）',
    );
  }
  return normalizeMember(input);
}

/**
 * 读当前会员会话，**不触发登录**。无则 null —— 即游客。
 *
 * 与 ensureMemberSession 的区别：那个是"必须有身份，没有就登录"（用于约课等
 * 私有操作）；这个是"有就带上，没有就算了"（用于浏览公共数据）。
 * C 端允许匿名浏览，首页/购卡用本函数；约课/签到才用 ensureMemberSession。
 */
export function getMemberSession(): Session | null {
  return read(KEY_MEMBER);
}

/** 清除会员会话，回到游客（演示身份切换里的"游客"选项用） */
export function clearMemberSession(): void {
  wx.removeStorageSync(KEY_MEMBER);
}

/** 取当前会员身份（无则登录）。网关模式下 memberId 由服务端 token 决定 */
export async function ensureMemberSession(memberId?: string): Promise<Session> {
  const cached = read(KEY_MEMBER);
  if (cached && (!memberId || cached.memberId === memberId)) return cached;

  const data = DEMO_MODE
    ? await callApi<{ token: string }>('demoLogin', { memberId: memberId || 'mb_nico' })
    : await loginByWx();

  if (!data?.token) throw new Error('登录失败：服务端未返回 token');
  return save(KEY_MEMBER, data.token);
}

/** 取当前员工身份（无则登录）。B 端用 */
export async function ensureStaffSession(openid?: string): Promise<Session> {
  const cached = read(KEY_STAFF);
  if (cached && (!openid || cached.openid === openid)) return cached;

  const data = DEMO_MODE
    ? await callApi<{ token: string }>('demoLogin', { openid: openid || 'demo_openid_admin' })
    : await loginByWx();

  if (!data?.token) throw new Error('登录失败：服务端未返回 token');
  return save(KEY_STAFF, data.token);
}

/** 真实登录：wx.login code → 云函数换 openid → token */
async function loginByWx(): Promise<{ token: string }> {
  const { code } = await new Promise<{ code: string }>((resolve, reject) => {
    wx.login({
      success: (r) => resolve({ code: r.code }),
      fail: (e) => reject(new Error(e.errMsg || 'wx.login 失败')),
    });
  });
  return callApi<{ token: string }>('login', { code });
}

/** 当前会员 ID（供展示与直连兜底） */
export function currentMemberId(): string {
  return read(KEY_MEMBER)?.memberId || normalizeMember();
}

/** 当前员工 openid */
export function currentStaffOpenid(): string {
  return read(KEY_STAFF)?.openid || '';
}

export function clearSessions(): void {
  wx.removeStorageSync(KEY_MEMBER);
  wx.removeStorageSync(KEY_STAFF);
}
