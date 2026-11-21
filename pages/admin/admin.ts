/**
 * B 端 · 人员与角色。
 *
 * 演示期没有登录，用「演示身份切换」模拟不同员工登录 —— 与 C 端首页的会员身份切换同一套策略。
 * 页面上能看到三件事：
 *   1. 我是谁（人员 + 角色 + 门店）
 *   2. 我能做什么（abilities，**由服务端下发**，端上不推导）
 *   3. 有 ROLE_GRANT 时，还能给其他人授/收角色
 *
 * 权限判定不在端上：这里点了"授予"，能否成功由服务端 `rg_staff_grant_role` 决定，
 * 无权限会返回 FORBIDDEN 并按映射提示 —— 端上不做"看起来能点但点了没用"的假象。
 */
import { ensureStaffSession } from '../../services/identity';
import { ping } from '../../services/gateway';
import {
  DEMO_STAFFS,
  REASON_TEXT,
  getAuditList,
  getMe,
  getReportCardSales,
  getReportCheckinTrend,
  getReportCoachIncome,
  grantRole,
  listStaff,
  listStores,
  revokeRole,
  type AuditRow,
  type CheckinReport,
  type IncomeRow,
  type MeView,
  type SalesReport,
  type StaffRole,
  type StaffRow,
  type StoreOption,
} from '../../services/api/admin';

const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: '管理员',
  STORE_MANAGER: '店长',
  COACH: '教练员',
};

const ACTION_LABEL: Record<string, string> = { GRANT: '授予', REVOKE: '回收' };

const fmtMoney = (n: number) => '¥' + Number(n || 0).toLocaleString('zh-CN');
const fmtRate = (r: number) => Math.round((r || 0) * 100) + '%';

/** 近三个月（含本月），默认选中上月 —— 当月未结束，数据不全 */
function recentMonths(): { list: string[]; current: string } {
  const now = new Date();
  const list: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return { list, current: list[list.length - 2] };
}

Page({
  data: {
    loading: true,
    openid: DEMO_STAFFS[0].openid,
    demoStaffs: DEMO_STAFFS as unknown as Array<{ openid: string; label: string }>,
    me: null as MeView | null,
    staffs: [] as StaffRow[],
    stores: [] as StoreOption[],
    error: '',
    pingText: '',
    /** 滚动位置（点标题回顶用） */
    scrollTop: 0,

    /** 报表：月份切换（默认上月，当月数据不全） */
    reportMonth: '',
    reportMonths: [] as string[],
    /** 教练收入（管理员/店长=全店，教练=仅自己） */
    incomeRows: [] as Array<IncomeRow & { rateLabel: string; amountLabel: string; revenueLabel: string }>,
    incomeSummary: '',
    /** 到店签到（近 30 天） */
    checkin: null as CheckinReport | null,
    /** 卡销售 */
    salesRows: [] as Array<{ productName: string; count: number; amountLabel: string }>,
    salesSummary: '',
    /** 审计记录 */
    audits: [] as Array<AuditRow & { actionLabel: string; timeLabel: string; detailText: string }>,
  },

  onLoad() {
    const { list, current } = recentMonths();
    this.setData({ reportMonths: list, reportMonth: current });
    this.fetch();
  },

  /** 报表月份切换：只重拉月度报表（签到趋势按天、不按月份） */
  async onReportMonthTap(e: WechatMiniprogram.TouchEvent) {
    const month = (e.currentTarget.dataset as { month: string }).month;
    if (!month || month === this.data.reportMonth) return;
    this.setData({ reportMonth: month });
    await this.loadReport();
  },

  /**
   * 拉报表与审计。
   *
   * 管理员/店长：全店报表 + 审计；教练：只拉自己的收入（库函数按 openid 收敛）。
   * 报表失败不拖垮整页 —— 权限差异（教练看不了售卡）是正常情形，不报错。
   */
  async loadReport() {
    const me = this.data.me;
    if (!me) return;
    const canReport = me.abilities.includes('ROLE_GRANT') || me.abilities.includes('ANNOUNCE_REVIEW');
    const isCoach = me.abilities.includes('COMMISSION_VIEW');
    const storeNameOf = (id?: string | null) =>
      this.data.stores.find((s: StoreOption) => s.id === id)?.name || '';

    if (canReport || isCoach) {
      try {
        const income = await getReportCoachIncome(this.data.reportMonth || undefined);
        this.setData({
          incomeRows: income.rows.map((r) => ({
            ...r,
            rateLabel: fmtRate(r.rate),
            amountLabel: fmtMoney(r.amount),
            revenueLabel: fmtMoney(r.revenue),
          })),
          incomeSummary:
            `${income.summary.coachCount} 位教练 · 实收 ${fmtMoney(income.summary.totalRevenue)}` +
            ` · 提成 ${fmtMoney(income.summary.totalAmount)}`,
        });
      } catch (e) {
        console.warn('[admin] 收入报表失败', e);
      }
    }

    if (canReport) {
      try {
        const [checkin, sales, audit] = await Promise.all([
          getReportCheckinTrend(30),
          getReportCardSales(this.data.reportMonth || undefined),
          getAuditList(10),
        ]);
        this.setData({
          checkin,
          salesRows: sales.byProduct.map((p) => ({
            productName: p.productName,
            count: p.count,
            amountLabel: fmtMoney(p.amount),
          })),
          salesSummary: `${sales.summary.totalCount} 单 · ${fmtMoney(sales.summary.totalAmount)}`,
          audits: audit.rows.map((a) => ({
            ...a,
            actionLabel: ACTION_LABEL[a.action] || a.action,
            timeLabel: (a.createdAt || '').slice(5, 16).replace('T', ' '),
            detailText: a.detail?.role
              ? ROLE_LABEL[a.detail.role] +
                (a.detail.storeId ? ' · ' + (storeNameOf(a.detail.storeId) || a.detail.storeId) : '')
              : '',
          })),
        });
      } catch (e) {
        console.warn('[admin] 报表/审计失败', e);
      }
    }
  },

  /**
   * 返回。
   *
   * 全局是自定义导航（没有系统返回键），本页又不在 tabBar 里 —— 不自带返回，
   * 真机进去就只能在微信里杀掉小程序重进。
   * 用编译模式直接进来时没有上一页，这时退回首页，而不是"点了没反应"。
   */
  /**
   * 回到顶部（点页面标题触发）。
   *
   * scroll-top 必须发生**变化**才会触发滚动：如果当前已是 0，直接设 0 无效。
   * 所以先置 1 再置 0 —— 1px 的位移肉眼不可见，但能让属性变化被监听到。
   */
  onBackTopTap() {
    this.setData({ scrollTop: 1 }, () => this.setData({ scrollTop: 0 }));
  },

  onBackTap() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  onPullDownRefresh() {
    this.fetch().finally(() => wx.stopPullDownRefresh());
  },

  async fetch() {
    try {
      // 先按当前演示身份（或真实登录）取 token —— 切身份时会重新签发
      await ensureStaffSession(this.data.openid);

      const raw = await getMe();
      const canGrant = raw.abilities.includes('ROLE_GRANT');

      // 角色中文在这里算好：WXML 调不了 TS 方法
      const me: MeView = {
        ...raw,
        roles: raw.roles.map((r) => ({ ...r, label: ROLE_LABEL[r.role] })),
      };

      // 只有管理员才需要人员列表 —— 不给无权限的人拉全量数据，
      // 既是最小必要，也避免"看得到但改不了"的界面噪音。
      const rows = canGrant ? await listStaff() : [];
      const staffs = rows.map((s) => ({
        ...s,
        roles: s.roles.map((r) => ({ ...r, label: ROLE_LABEL[r.role] })),
      }));
      const stores = this.data.stores.length ? this.data.stores : await listStores();

      this.setData({ loading: false, error: '', me, staffs, stores });
      // 报表依赖 stores（审计详情里的门店名要翻译），所以在 stores 就绪后再拉
      await this.loadReport();
    } catch (e) {
      const err = e as { message?: string };
      this.setData({ loading: false, error: err.message || '加载失败' });
    }
  },

  /**
   * 通道自检。
   *
   * 真机没有控制台，云函数链路通不通一眼看不出来 —— 这个按钮直接把结果打在页面上
   * （演示期保留，上线前与演示身份切换一起删）。
   */
  async onPingTap() {
    try {
      const r = await ping();
      this.setData({
        pingText:
          `云函数可达 · token ${r.tokenReady ? '已配置' : '缺失'} · ` +
          `微信登录 ${r.wxLoginReady ? '可用' : '未配置 AppSecret'} · ` +
          `DEMO ${r.demoMode ? '开' : '关'}`,
      });
    } catch (e) {
      this.setData({ pingText: `云函数不可达：${(e as Error).message}` });
    }
  },

  /** 演示身份切换 */
  onStaffTap(e: WechatMiniprogram.TouchEvent) {
    const openid = (e.currentTarget.dataset as { openid: string }).openid;
    if (openid === this.data.openid) return;
    this.setData({ openid, loading: true }, () => this.fetch());
  },

  /** 授予角色：角色用 ActionSheet 选；门店取列表第一个（库里目前只有一家店） */
  onGrantTap(e: WechatMiniprogram.TouchEvent) {
    const staffId = (e.currentTarget.dataset as { id: string }).id;
    const me = this.data.me;
    if (!me?.abilities.includes('ROLE_GRANT')) {
      wx.showToast({ title: '没有权限', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: ['授予为 教练员', '授予为 店长', '授予为 管理员'],
      success: (res) => {
        const roles: StaffRole[] = ['COACH', 'STORE_MANAGER', 'ADMIN'];
        const role = roles[res.tapIndex];
        if (!role) return;

        // 管理员是全局角色（store_id 为空），其余必须绑门店
        const storeId = role === 'ADMIN' ? null : this.data.stores[0]?.id ?? null;
        this.doGrant(staffId, role, storeId);
      },
      fail: () => {
        /* 用户取消，不打扰 */
      },
    });
  },

  /**
   * 执行授予。
   *
   * 授予 ADMIN 单独二次确认（ROL-06）：管理员拥有全部门店的最高权限，含授权他人，
   * 一次误点就是权限事故 —— 这一步不是"多点一次"，是最后一道闸。
   */
  async doGrant(staffId: string, role: StaffRole, storeId: string | null) {
    if (role === 'ADMIN') {
      const confirmed = await new Promise<boolean>((resolve) => {
        wx.showModal({
          title: '授予管理员？',
          content: '管理员拥有全部门店的最高权限（含授权他人）。确认继续？',
          success: (r) => resolve(!!r.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }

    try {
      // 操作者身份不再作为参数传 —— 服务端从 token 取（SEC-01）
      const r = await grantRole(staffId, role, storeId);
      if (!r.ok) {
        wx.showToast({ title: REASON_TEXT[r.reason ?? ''] ?? '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: `已授予${ROLE_LABEL[role]}`, icon: 'none' });
      await this.fetch();
    } catch (err) {
      wx.showToast({ title: (err as Error).message || '授权失败', icon: 'none' });
    }
  },

  /** 回收角色：二次确认 —— 权限变更不可撤销得太随意 */
  onRoleTap(e: WechatMiniprogram.TouchEvent) {
    const { id, role } = e.currentTarget.dataset as { id: string; role: StaffRole };
    const me = this.data.me;
    if (!me?.abilities.includes('ROLE_REVOKE')) {
      wx.showToast({ title: '没有权限', icon: 'none' });
      return;
    }

    wx.showModal({
      title: `回收「${ROLE_LABEL[role]}」？`,
      content: '回收后该员工立即失去对应功能，操作会记入审计。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const r = await revokeRole(id, role);
          if (!r.ok) {
            wx.showToast({ title: REASON_TEXT[r.reason ?? ''] ?? '操作失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: '已回收', icon: 'none' });
          await this.fetch();
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '回收失败', icon: 'none' });
        }
      },
    });
  },
});
