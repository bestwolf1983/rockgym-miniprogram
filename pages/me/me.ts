/**
 * 我的 —— 通行证详情 + 我的卡。
 *
 * 三 tab 的分工：首页回答「来了能干什么」，商城回答「怎么买」，这里回答
 * 「我是谁、能不能进、还剩多少」。
 *
 * 页面不做准入判定，通行证卡由 admission-card 组件按服务端结论渲染；
 * 退费金额也直接取服务端的 refundQuote，前端不参与计算。
 */
import { getHome, type HomeView } from '../../services/api/home';
import { syncTabBar } from '../../services/tabbar';
import { ensureMemberSession } from '../../services/identity';

Page({
  data: {
    loading: true,
    /** 游客（未登录）：显示登录引导，不渲染通行证与我的卡 */
    isVisitor: true,
    initial: '岩',
    meSub: '',
    member: null as HomeView['member'] | null,
    admission: null as HomeView['admission'] | null,
    myCards: [] as HomeView['myCards'],
  },

  onLoad() {
    this.fetch();
  },

  onShow() {
    syncTabBar(this, 3);
    if (!this.data.loading) this.fetch();
  },

  onPullDownRefresh() {
    this.fetch().finally(() => wx.stopPullDownRefresh());
  },

  async fetch() {
    try {
      const view = await getHome({});
      const isVisitor = !view.member?.id; // member.id 为空 = 服务端按游客返回
      const m = view.member;
      const bits: string[] = [];
      if (m.visitCount) bits.push(`到访 ${m.visitCount} 次`);
      if (m.phoneLast4) bits.push(`手机尾号 ${m.phoneLast4}`);
      if (m.examScore) bits.push(`考核 ${m.examScore} 分`);
      this.setData({
        loading: false,
        isVisitor,
        member: m,
        admission: view.admission,
        myCards: view.myCards,
        initial: isVisitor ? '游' : (m.displayName || '?').trim().slice(0, 1),
        meSub: isVisitor ? '登录后查看通行证与我的卡' : bits.join(' · ') || '新会员',
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[me] 加载失败', e);
      wx.showToast({ title: '加载失败，下拉重试', icon: 'none' });
    }
  },

  /**
   * 游客 → 登录。
   * 演示期签默认演示身份（mb_nico）；生产走 wx.login → 服务端换 openid。
   * 登录成功（或换了身份）后重拉，通行证与我的卡才会出现。
   */
  async onLoginTap() {
    try {
      await ensureMemberSession();
      await this.fetch();
    } catch (e) {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  },

  onPassAction() {
    const a = this.data.admission;
    if (!a) return;
    wx.showToast({ title: a.action.text, icon: 'none' });
  },

  /**
   * B 端入口。
   *
   * 放在「我的」页底部一行小字，而不是占一个 tab —— B 端只有员工会用，
   * 做成 tab 等于让每个会员都看到一个自己点进去是空的入口。
   */
  onStaffEntryTap() {
    wx.navigateTo({
      url: '/pages/admin/admin',
      fail: () => wx.showToast({ title: 'B 端页面未就绪', icon: 'none' }),
    });
  },
});
