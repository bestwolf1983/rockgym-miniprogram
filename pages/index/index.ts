/**
 * 首页。
 *
 * 信息优先级由数据决定，不由代码写死：
 *   · 无预约（大多数散客）→ 课表时间轴是主体
 *   · 有预约 → myToday 置顶到课表之前
 * 服务端返回 myToday 为 null 即代表前者，页面不做身份判断。
 *
 * 上端不含任何业务判定：课次状态、CTA 文案、准入结论都在 rg_home() 里算好。
 */
import { getHome, EMPTY_SCHEDULE, type HomeView } from '../../services/api/home';
import { syncTabBar } from '../../services/tabbar';
import { API_BASE, ASSET_CDN_BASE, DEMO_MODE } from '../../services/config';
import { clearMemberSession, ensureMemberSession } from '../../services/identity';
import { allHosts, failedHosts, lastNetError, netSummary } from '../../services/netlog';

/**
 * 真机排查用：把加载失败的原因显示在页面上。
 *
 * 真机没有控制台，`console.error` 看不到 —— 而真机恰恰是最容易出问题的地方
 * （域名白名单、鉴权、网络代理）。把错误与请求目标域名直接摊在页面上，
 * 截图就能定位。演示期保留，正式版连同 WXML 里的 .load-err 一起删。
 */
function describeError(e: unknown): string {
  if (!e) return '未知错误';
  if (typeof e === 'string') return e;
  const err = e as Record<string, unknown>;
  // SDK 抛出的错误字段不固定（errMsg / message / code / errCode / requestId），
  // 全列出来比赌某一个字段有用 —— 真机上只看到 "undefined" 就说明赌错了字段。
  const parts = [err.errMsg, err.message, err.code, err.errCode, err.requestId]
    .filter((v) => v !== undefined && v !== null && v !== '' && v !== 'undefined')
    .map(String);
  return parts.length ? parts.join(' | ') : JSON.stringify(e);
}

/** 真机环境信息：网络与基础库版本。用来区分"没网"和"被域名校验拦了" */
async function envInfo(): Promise<string> {
  const base = wx.getAppBaseInfo?.() as { SDKVersion?: string } | undefined;
  const network = await new Promise<string>((resolve) => {
    wx.getNetworkType({
      success: (r) => resolve(r.networkType),
      fail: () => resolve('unknown'),
    });
  });
  return `网络 ${network} · 基础库 ${base?.SDKVersion ?? '?'}`;
}

Page({
  data: {
    loading: true,
    /**
     * 当前身份。'visitor' = 游客（匿名浏览：能看课表/教练/换线，不能约课/入场）。
     * 默认游客 —— 首页打开不该弹登录框；登录在"用户想操作"时才发生。
     * 演示身份切换会把游客切到四种会员状态之一。
     */
    memberId: 'visitor',
    /** 游客（未登录）：私人区块显示占位，预约类操作提示登录 */
    isVisitor: true,
    /**
     * 演示模式开关。四种会员状态是本产品最核心的差异（准入判定的四个分支），
     * 不给切换入口，演示时只能看到一种状态。
     * 正式上线前置 false（或删掉这段与 WXML 里的 demo-switch）。
     */
    demoMode: true,
    demoMembers: [
      { id: 'visitor', label: '游客' },
      { id: 'mb_nico', label: '已认证' },
      { id: 'mb_pend', label: '待核验' },
      { id: 'mb_exp', label: '已过期' },
      { id: 'mb_new', label: '未认证' },
    ],
    store: null as HomeView['store'] | null,
    member: null as HomeView['member'] | null,
    admission: null as HomeView['admission'] | null,
    myToday: null as HomeView['myToday'],
    schedule: EMPTY_SCHEDULE,
    coaches: [] as HomeView['coaches'],
    cardProducts: [] as HomeView['cardProducts'],
    myCards: [] as HomeView['myCards'],
    serverTime: '',
    /** 换线信息（ROUTE）。服务端已算好天数与直方图，前端只渲染 */
    routeBoard: null as HomeView['routeBoard'] | null,
    /** 加载失败的原因（真机排查用，空串表示正常） */
    loadError: '',
    /** 真机环境信息：网络类型 + 基础库版本 */
    envInfo: '',
    /** 网络层原始错误（js-sdk 的 FetchError 会丢掉 errMsg，这里补回来） */
    netInfo: '',
    /** 本次会话请求过的全部域名（配微信白名单用） */
    netHosts: '',
    /** 请求的目标域名，真机排查时用来比对微信后台的白名单 */
    dbHost: API_BASE,
    /** 场馆平面图（CDN，图片不进包） */
    floorplanUrl: `${ASSET_CDN_BASE}/assets/venue/floorplan.jpg`,
    /** 课表筛选条件，切换时只重拉课表 */
    filter: { date: '', grade: 'all' },
  },

  /**
   * 直方图柱高预计算。
   * WXML 里做不了 max() 兜底，最短的柱会退化成一条线看不出来"有线路"，
   * 因此在 setData 前算好百分比（下限 8%）。
   */
  withBarPercent(board?: HomeView['routeBoard'] | null) {
    if (!board || !board.areas) return null;
    return {
      ...board,
      areas: board.areas.map((a) => ({
        ...a,
        histograms: (a.histograms || []).map((h) => ({
          ...h,
          bars: (h.bars || []).map((b) => ({
            ...b,
            percent: Math.max(8, Math.round((b.count / (h.maxCount || 1)) * 100)),
          })),
        })),
      })),
    };
  },

  onLoad() {
    this.fetch();
  },

  onShow() {
    // 自定义 tabBar 是每个页面各自实例化的组件，切页后 data 会重置，
    // 必须在此主动同步选中态；否则 onTap 里的 `index === active` 守卫
    // 会把「回到本页对应的 tab」误判成重复点击而拦掉。
    syncTabBar(this, 0);
    // 从签署/购卡等页面返回时准入状态可能已变，需刷新通行证卡
    if (!this.data.loading) this.fetch();
  },

  onPullDownRefresh() {
    this.fetch().finally(() => wx.stopPullDownRefresh());
  },

  async fetch() {
    try {
      const view = await getHome({
        memberId: this.data.memberId,
        date: this.data.filter.date || undefined,
        grade: this.data.filter.grade === 'all' ? undefined : this.data.filter.grade,
      });
      this.setData({
        loading: false,
        loadError: '',
        netHosts: allHosts(),
        isVisitor: !view.member?.id, // member.id 为空 = 服务端按游客返回
        store: view.store,
        member: view.member,
        admission: view.admission,
        myToday: view.myToday,
        schedule: view.schedule ?? EMPTY_SCHEDULE,
        coaches: view.coaches,
        cardProducts: view.cardProducts,
        myCards: view.myCards,
        serverTime: view.serverTime,
        routeBoard: this.withBarPercent(view.routeBoard),
      });
    } catch (e) {
      this.setData({
        loading: false,
        loadError: describeError(e),
        envInfo: await envInfo(),
        netInfo: `${netSummary()} · ${lastNetError()}${failedHosts() ? ` · 失败域名 ${failedHosts()}` : ''}`,
        netHosts: allHosts(),
      });
      console.error('[home] 加载失败', e);
      wx.showToast({ title: '加载失败，下拉重试', icon: 'none' });
    }
  },

  onDayTap(e: WechatMiniprogram.TouchEvent) {
    const date = (e.currentTarget.dataset as { date: string }).date;
    this.setData({ 'filter.date': date }, () => this.fetch());
  },

  onGradeTap(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: string }).key;
    this.setData({ 'filter.grade': key }, () => this.fetch());
  },

  /**
   * 演示身份切换。切完重拉整页 —— 准入结论、我的今日、我的卡都会跟着变。
   * 'visitor' 是回到游客：清掉会员会话，重新匿名浏览。
   * 其他身份先 demoLogin 拿 token（服务端签发），再拉数据 —— 身份不自己申报。
   */
  async onDemoMemberTap(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset as { id: string }).id;
    if (id === this.data.memberId) return;
    if (id === 'visitor') {
      clearMemberSession();
      this.setData({ memberId: 'visitor', loading: true }, () => this.fetch());
      return;
    }
    try {
      await ensureMemberSession(id);
      this.setData({ memberId: id, loading: true }, () => this.fetch());
    } catch (err) {
      console.error('[home] 演示身份登录失败', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  /**
   * 游客 → 登录。
   *
   * 演示期（DEMO_MODE）：签发默认演示身份，要体验其他状态请用上方切换器。
   * 生产：wx.login → 服务端换 openid → 匹配会员；未建档（needBind）时引导到店。
   */
  async onLoginTap() {
    try {
      await ensureMemberSession();
      this.setData({ memberId: DEMO_MODE ? 'mb_nico' : this.data.memberId }, () => this.fetch());
    } catch (e) {
      wx.showToast({ title: describeError(e), icon: 'none' });
    }
  },

  onStoreTap() {
    wx.showToast({ title: 'v1 仅三里屯店', icon: 'none' });
  },

  /**
   * 扫码签到。
   *
   * 扫的是**馆内的码**（用户主动扫），不是出示自己的码 —— 与 H5 保持一致。
   * 小程序端直接用 wx.scanCode，不需要像 H5 那样引 jsQR 解码库。
   *
   * 核销接口（intend.md SCAN-02）尚未实现：这里只回显识别结果。
   * 接入后应把结果送服务端校验 —— 客户端拿到的任何结论都不作数，判定在服务端。
   */
  onScanTap() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const text = (res && res.result) || '';
        wx.showModal({
          title: '扫码成功',
          content: `识别到：${text}\n\n签到核销接口（SCAN-02）尚未接入`,
          showCancel: false,
        });
      },
      fail: (err) => {
        const msg = err?.errMsg || '';
        // 用户主动取消不算错误，不打扰
        if (/cancel/.test(msg)) return;

        // 权限类失败要给出可操作的指引，而不是笼统的"请重试"——
        // 重试一万次也没用，得去设置里开摄像头（或等隐私指引审核通过）。
        if (/permission|auth|privacy|scope/i.test(msg)) {
          wx.showModal({
            title: '无法使用扫一扫',
            content:
              '请在「微信 → 设置 → 隐私 → 授权管理」中允许本小程序使用摄像头；\n' +
              '若仍不可用，请联系前台协助签到。',
            showCancel: false,
          });
          return;
        }
        wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
        console.error('[scan] 失败', msg);
      },
    });
  },

  /** 平面图放大查看（信息密度高，缩略尺寸下区域名读不清） */
  onFloorplanTap() {
    wx.previewImage({
      current: this.data.floorplanUrl,
      urls: [this.data.floorplanUrl],
    });
  },

  /** 未通过认证时的引导：去「我的」看完整通行证详情 */
  onPassActionTap() {
    wx.switchTab({ url: '/pages/me/me' });
  },

  /** 我的今日 → 出示入场码：入场码在「我的」页 */
  onMyQrTap() {
    wx.switchTab({ url: '/pages/me/me' });
  },

  onMySessionTap() {
    const id = this.data.myToday?.sessionId;
    if (id) wx.showToast({ title: `课次 ${id}`, icon: 'none' });
  },

  /**
   * 教练（含私教角标 PT-05）→ 教练详情页（PQ-1）。
   * 是否可点由服务端 ptBadge.clickable 下发，前端不做判定。
   */
  onCoachTap(e: WechatMiniprogram.TouchEvent) {
    const { id, clickable } = e.currentTarget.dataset as { id: string; clickable: string };
    if (clickable !== 'true') {
      wx.showToast({ title: '该教练近期已约满', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/coach/coach?id=${id}` });
  },

  /** 合规公示（PAY-05）：常驻页尾，去商城页 */
  onDisclosureTap() {
    wx.switchTab({ url: '/pages/mall/mall' });
  },
});
