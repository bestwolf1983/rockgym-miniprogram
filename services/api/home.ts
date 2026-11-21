/**
 * 首页 BFF 聚合接口。
 *
 * 一次 RPC 返回整页数据。拆成多个请求会让首屏预算失控（NFR-01 ≤1.5s）。
 *
 * 两条不可动摇的边界：
 *   1. `admission` 由服务端 rg_admission() 计算，含展示状态、文案与去向。
 *   2. 时间轴每一项的 `state`（past/live/upcoming）与 `cta` 也由服务端算。
 *      客户端本地时间不可信（用户可改系统时间），且业务日必须按门店时区判定。
 *
 * 数据源：CloudBase PostgreSQL 的 rg_home() 函数（services/db.ts）。
 * 后续若迁到自建 API，只需替换本文件的实现，页面与组件不动。
 */
import { getMemberSession, type DemoMember } from '../identity';
import { ASSET_CDN_BASE } from '../config';
import { callApi } from '../gateway';
import type { TimelineEntry } from '../../components/biz/course-timeline/index';

export interface GradeFilter {
  key: string;
  label: string;
  active: boolean;
}

export interface CardProduct {
  id: string;
  name: string;
  type: string;
  price: number;
  times: number | null;
  durationDays: number | null;
  singleEntryPrice: number;
  validDays: number | null;
  transferable: boolean;
  dailyTransferLimit: number;
  bindHolder: boolean;
  prepaidRegulated: boolean;
  /** ★ 能否购买：备案未完成时受监管卡种为 false，由服务端算 */
  listed: boolean;
}

export interface MyCard {
  id: string;
  name: string;
  type: string;
  timesTotal: number | null;
  timesUsed: number;
  timesLeft: number | null;
  daysLeft: number | null;
  deferredBalance: number;
  paidAmount: number;
  singleEntryPrice: number;
  transferable: boolean;
  dailyTransferLimit: number;
  bindHolder: boolean;
  expireAt: string | null;
  /** PURCHASED 自购 | SHARED 好友分享 */
  source: string;
  /** ACTIVE 可用 | PENDING_ACTIVATION 待激活（分享卡未满足安全要求） */
  status: string;
  canShare: boolean;
  sharableTimes: number;
  activation: { title: string; missing: Array<{ key: string; label: string; sort: number; detail: string; actionText: string }> } | null;
  refundQuote: {
    paid: number;
    usedTimes: number;
    unitPrice: number;
    deduct: number;
    penalty: number;
    refundable: number;
  };
}

export interface HomeView {
  store: {
    id: string;
    name: string;
    legalEntity: string;
    uscc: string;
    hotline: string;
    filingStatus: 'PENDING' | 'FILED' | 'REJECTED';
  };
  member: {
    id: string;
    displayName: string;
    phoneLast4: string | null;
    visitCount: number;
    examScore: number | null;
    unreadCount: number;
  };
  admission: {
    state: 'none' | 'pending' | 'expired' | 'pass';
    /** 状态灯颜色。由 state 映射，纯视觉，不含判定 */
    light: 'GREEN' | 'YELLOW' | 'RED' | 'GRAY';
    title: string;
    greeting: string;
    quals: Array<{ label: string; kind: 'pass' | 'warn' | 'block' | 'off' }>;
    metaLines: string[];
    action: { text: string; path: string; tone: 'primary' | 'warn' | 'block' };
    pendingConfirmCount: number;
  };

  /**
   * 我的今日预约。为空（大多数散客的情况）首页以课表为主体；
   * 非空时置顶到课表之前。同一个首页两种信息优先级。
   */
  myToday: {
    sessionId: string;
    timeRange: string;
    storeName: string;
    title: string;
    highlightText: string;
    coach: { nickname: string; avatarUrl: string; tagline: string };
    canShowQr: boolean;
  } | null;

  /** ★ 今日课表，散客首屏主体 */
  schedule: {
    date: string;
    days: Array<{ date: string; weekLabel: string; dayLabel: string; sessionCount: number; active: boolean }>;
    gradeFilters: GradeFilter[];
    entries: TimelineEntry[];
    /** 当前时刻线插在第几项之后，服务端按门店时区算，-1 表示不显示 */
    nowAfterIndex: number;
    nowLabel: string;
  };

  /** 本店教练。攀岩馆复购跟人走，这条横滑是有效的 */
  coaches: Array<{
    id: string;
    nickname: string;
    avatarUrl: string;
    specialtyLabel: string;
    tagline: string;
    yearsOfExp: number;
    /** 可带教项目（教练详情页展示可带教项目用，PQ-1） */
    qualScope?: string[];
    /**
     * 私教角标（PT-05）。文案/配色/可点性全部由服务端算好下发：
     *   青「约私教」可点 / 红「约满」不可点 / show=false 则不显示角标。
     * 待 PT-03 排班表上线后，pt_status 从手工值改为计算值，前端无需改动。
     */
    ptBadge?: {
      show: boolean;
      text: string | null;
      tone: 'primary' | 'block';
      clickable: boolean;
      path: string;
    };
  }>;

  /**
   * 换线信息（ROUTE-01~06）：分区独立换线。
   *
   * 正/倒计时天数与直方图均由服务端 rg_route_board() 按门店时区算好，
   * 客户端不做日期运算 —— 本地时间不可信，业务日须按门店时区判定。
   */
  routeBoard?: {
    storeId: string;
    areas: Array<{
      areaCode: string;
      areaName: string;
      /** 正计时：换线至今 */
      freshLabel: string;
      isFresh: boolean;
      /** 倒计时：距下次换线。未设定下次时间时为 null，前端不展示 */
      countdownLabel: string | null;
      isUrgent: boolean;
      setter: { name: string; title: string; avatarUrl: string } | null;
      routeCount: number;
      /** 难度分布直方图。综合馆可能有多组（抱石 V 系 / 难度 YDS），两套体系不可比，分别成图 */
      histograms: Array<{
        system: string;
        systemLabel: string;
        maxCount: number;
        bars: Array<{ label: string; count: number }>;
      }>;
    }>;
  };

  /** 卡种（商城页用）。能不能卖由服务端按备案状态算好 */
  cardProducts: CardProduct[];

  /** 我的卡（我的页用） */
  myCards: MyCard[];

  serverTime: string;
}

export interface GetHomeParams {
  memberId?: string;
  date?: string;
  /** all 时不传，让数据库走自己的默认值 */
  grade?: string;
}

/** 难度筛选是静态 UI 选项，不属于业务判定，所以放前端 */
const GRADE_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'beginner', label: 'V0–V2 起步' },
  { key: 'intermediate', label: 'V3–V5 进阶' },
  { key: 'advanced', label: 'V6+ 高阶' },
];

/** 准入状态 → 状态灯。纯视觉映射，不做任何判定 */
const LIGHT: Record<string, HomeView['admission']['light']> = {
  pass: 'GREEN',
  pending: 'YELLOW',
  expired: 'RED',
  none: 'GRAY',
};

export async function getHome(params: GetHomeParams = {}): Promise<HomeView> {
  const grade = params.grade ?? 'all';

  // 有会话带 token（会员视图），无会话即游客（公共数据视图）。
  // 游客浏览是产品需求：匿名能看课表/教练/换线，但不能约课不能入场 ——
  // 后者由需要 token 的 action（book 等）与 rg_admission 门禁保证。
  // 这里不主动登录：首页打开不该弹登录框，登录在"用户想操作"时才发生。
  const session = getMemberSession();
  const raw = await callApi<any>(
    'home',
    { date: params.date || undefined, grade: params.grade || undefined },
    session?.token ?? '',
  );
  return normalize(raw, grade);
}

/**
 * 头像路径归一化。
 *
 * 库里 coach.avatar_url 存的是 `assets/coach/coach-02.jpg` —— H5 的相对路径写法，
 * 在浏览器里相对页面 URL 解析，没问题。
 *
 * 但小程序 <image src> 不支持相对路径：它会被拼到页面所在目录下，解析成
 *   /__pageframe__/pages/index/assets/coach/coach-02.jpg
 * 于是必然 404（报错里 net::OK 说明请求本身通了，只是文件不在那个位置）。
 *
 * 小程序的本地资源必须用「以 / 开头的绝对路径」，即 /assets/coach/coach-02.jpg。
 * 所以这里只做一件事：把库里的相对路径补成绝对路径。
 *
 * 图片资源已从 prototype/assets/coach/ 迁入小程序 assets/coach/（用 jpg 版本，
 * 4 张共 100K；png 版是 1024×1024/1.4M 一张，主包放不下且头像只显示 68rpx）。
 *
 * 不动数据库：库里的相对路径对 H5 是正确的，改库会反过来搞坏 H5。
 * 端上的路径差异在端上消化 —— 这也是 services/api 层存在的意义。
 */
function resolveAssetUrl(url?: string): string {
  const u = (url ?? '').trim();
  if (!u) return '';
  // 已是远端 URL 的原样返回
  if (/^(https?:)?\/\//.test(u)) return u;
  // 其余（库里的相对路径 assets/... 或包内写法 /assets/...）统一拼 CDN 前缀。
  // 图片已迁到静态托管（包体积），本地包内不再放图 —— 见 config.ts ASSET_CDN_BASE。
  return ASSET_CDN_BASE + '/' + u.replace(/^\.?\//, '');
}

function withAvatar<T extends { avatarUrl?: string }>(c: T) {
  return { ...c, avatarUrl: resolveAssetUrl(c.avatarUrl) };
}

function normalize(raw: any, grade: string): HomeView {
  const currentGrade = GRADE_FILTERS.some((f) => f.key === grade) ? grade : 'all';
  return {
    ...raw,
    admission: {
      ...raw.admission,
      light: LIGHT[raw.admission?.state] ?? 'GRAY',
    },
    coaches: (raw.coaches ?? []).map(withAvatar),
    // 定线员头像同样来自库里的相对路径，不归一就会被解析成
    // /pages/index/assets/... 而 404（页面级相对路径）。
    routeBoard: raw.routeBoard
      ? {
          ...raw.routeBoard,
          areas: (raw.routeBoard.areas ?? []).map((a: any) => ({
            ...a,
            setter: a?.setter ? withAvatar(a.setter) : a?.setter,
          })),
        }
      : raw.routeBoard,
    myToday: raw.myToday
      ? { ...raw.myToday, coach: raw.myToday.coach ? withAvatar(raw.myToday.coach) : null }
      : raw.myToday,
    // 逐项兜底而非只 spread：{ ...null } 会展开成 {}，让 entries 变 undefined，
    // 而 course-timeline 的 entries 是 Array 类型，收到非数组会触发类型校验告警。
    schedule: {
      ...raw.schedule,
      date: raw.schedule?.date ?? '',
      days: raw.schedule?.days ?? [],
      entries: (raw.schedule?.entries ?? []).map((e: any) =>
        e?.coach ? { ...e, coach: withAvatar(e.coach) } : e,
      ),
      nowAfterIndex: raw.schedule?.nowAfterIndex ?? -1,
      nowLabel: raw.schedule?.nowLabel ?? '',
      gradeFilters: GRADE_FILTERS.map((f) => ({ ...f, active: f.key === currentGrade })),
    },
  };
}

/**
 * schedule 的空值兜底。
 *
 * 页面 data.schedule 不能初始化为 null：WXML 里取 schedule.entries 会求值成 undefined，
 * 传给 course-timeline 的 Array 属性会触发类型校验告警（首屏、请求失败都会命中）。
 * 空课表也必须是结构完整的对象，而不是 null。
 */
export const EMPTY_SCHEDULE: HomeView['schedule'] = {
  date: '',
  days: [],
  gradeFilters: [],
  entries: [],
  nowAfterIndex: -1,
  nowLabel: '',
};
