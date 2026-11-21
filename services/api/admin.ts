/**
 * B 端接口（人员 / 角色 / 授权）。
 *
 * 与 C 端同一条约束：**判定只在服务端**。
 * 这里拿到的 `abilities` 是服务端算好的能力清单，端上据此渲染菜单，
 * 不自己推导"这个角色能不能干这件事" —— 否则权限口径就会在两端各长一份。
 *
 * ⚠️ 演示期的 openid
 * ---------------------------------------------------------------------------
 * 现在没有登录体系（C 端 ME-09 同样为 ✗），openid 用约定的假值，
 * 由 B 端页面上的「演示身份切换」选择 —— 与 C 端首页的四种会员身份切换是同一套策略。
 * 真实接入后：wx.login() 取 code → 服务端换 openid → 端上只拿到"我是谁"，
 * 本文件的函数签名不用改。
 */
import { ensureStaffSession } from '../identity';
import { callApi } from '../gateway';

export type StaffRole = 'ADMIN' | 'STORE_MANAGER' | 'COACH';

export interface StaffRoleView {
  role: StaffRole;
  storeId: string | null;
  storeName: string | null;
}

export interface MeView {
  staff: { id: string; displayName: string; status: string } | null;
  roles: StaffRoleView[];
  abilities: string[];
}

export interface StaffRow {
  id: string;
  displayName: string;
  status: string;
  openid: string;
  roles: StaffRoleView[];
}

/** 演示身份。真实环境由登录态替换 */
export const DEMO_STAFFS = [
  { openid: 'demo_openid_admin', label: '管理员' },
  { openid: 'demo_openid_mgr', label: '店长' },
  { openid: 'demo_openid_kiki', label: '教练 Kiki' },
  { openid: 'demo_openid_none', label: '未授权' },
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 我是谁 + 我能做什么。
 *
 * 走云函数：openid 由服务端从 token 解析，端上不再传 —— 传了也没用，
 * 服务端只认 token。这是 SEC-01（身份由客户端申报）的修复点。
 */
export async function getMe(): Promise<MeView> {
  const s = await ensureStaffSession();
  return callApi<MeView>('adminMe', {}, s.token);
}

/** 人员列表（含各自的角色）。经云函数：无身份拿不到全量人员数据 */
export async function listStaff(): Promise<StaffRow[]> {
  const s = await ensureStaffSession();
  return callApi<StaffRow[]>('staffList', {}, s.token);
}

export interface StoreOption {
  id: string;
  name: string;
}

export async function listStores(): Promise<StoreOption[]> {
  // 门店是公共数据，经云函数公开 action —— 与私有调用同一条 HTTP 通道，
  // 端上不再直连数据库（js-sdk 已随这条改动退役）。
  return callApi<StoreOption[]>('storeList');
}

/**
 * 授予角色。
 *
 * 注意不再有 openid 参数 —— 操作者身份来自服务端 token；
 * 能不能授由库里的 `rg_staff_has_role` 判定，端上与云函数都不预检。
 */
export async function grantRole(
  target: string,
  role: StaffRole,
  storeId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await ensureStaffSession();
  return callApi<{ ok: boolean; reason?: string }>(
    'grantRole',
    { target, role, storeId },
    s.token,
  );
}

/** 回收角色 */
export async function revokeRole(
  target: string,
  role: StaffRole,
): Promise<{ ok: boolean; reason?: string }> {
  const s = await ensureStaffSession();
  return callApi<{ ok: boolean; reason?: string }>('revokeRole', { target, role }, s.token);
}

/** 失败原因 → 人话。服务端返回的 reason 是英文码，这里只做展示映射 */
export const REASON_TEXT: Record<string, string> = {
  FORBIDDEN: '没有权限：只有管理员能授权',
  STORE_REQUIRED: '请先指定门店',
  BAD_ROLE: '角色不合法',
  TARGET_NOT_FOUND: '找不到该人员',
  ALREADY_GRANTED: '已经有这个角色了',
  NOT_FOUND_OR_ALREADY_REVOKED: '角色不存在或已回收',
};

/* ---------------------------------------------------------------------------
 * 报表与审计（09_reporting.sql 的函数，经云函数转发）
 *
 * 权限在库函数里判：管理员/店长看全店，教练只看自己的收入，其余 FORBIDDEN。
 * 端上不知道口径，只渲染返回的行。
 * ------------------------------------------------------------------------- */

export interface AuditRow {
  id: string;
  action: string;
  actorName: string;
  targetName: string;
  detail: { role?: StaffRole; storeId?: string } | null;
  createdAt: string;
}

export interface IncomeRow {
  coachId: string;
  coachName: string;
  sessions: number;
  revenue: number;
  rate: number;
  amount: number;
  status: string;
}

export interface CheckinReport {
  byDay: Array<{ day: string; count: number }>;
  bySlot: Array<{ slot: string; count: number }>;
  summary: { total: number; avgPerDay: number; inRangeRate: number };
}

export interface SalesReport {
  byProduct: Array<{ productId: string; productName: string; type: string; count: number; amount: number }>;
  byChannel: Array<{ channel: string; count: number; amount: number }>;
  summary: { totalCount: number; totalAmount: number };
}

/** 库函数返回 { ok, reason?, ... }，这里把 ok=false 翻成异常，让页面统一走 catch */
async function reportCall<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const s = await ensureStaffSession();
  const res = await callApi<{ ok: boolean; reason?: string } & T>(action, params, s.token);
  if (!res.ok) {
    throw new Error(REASON_TEXT[res.reason ?? ''] ?? res.reason ?? '查询失败');
  }
  return res;
}

export function getAuditList(limit = 10) {
  return reportCall<{ rows: AuditRow[] }>('auditList', { limit });
}
export function getReportCoachIncome(month?: string) {
  return reportCall<{ rows: IncomeRow[]; summary: { coachCount: number; totalRevenue: number; totalAmount: number } }>(
    'reportCoachIncome', { month });
}
export function getReportCheckinTrend(days = 30) {
  return reportCall<CheckinReport>('reportCheckinTrend', { days });
}
export function getReportCardSales(month?: string) {
  return reportCall<SalesReport>('reportCardSales', { month });
}
