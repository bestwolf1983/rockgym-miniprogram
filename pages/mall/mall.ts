/**
 * 商城 —— 购卡。
 *
 * 能不能卖完全由服务端的 `listed` 字段决定：
 * 备案未完成时，受监管的卡种（次卡/月卡/季卡）自动置灰并说明原因，
 * 单次票不受影响。页面不判断任何备案逻辑，只渲染。
 */
import { getHome, type HomeView } from '../../services/api/home';
import { syncTabBar } from '../../services/tabbar';
import { getMemberSession } from '../../services/identity';

Page({
  data: {
    loading: true,
    store: null as HomeView['store'] | null,
    cardProducts: [] as HomeView['cardProducts'],
    filed: false,
    lockedCount: 0,
  },

  onLoad() {
    this.fetch();
  },

  onShow() {
    syncTabBar(this, 2);
    if (!this.data.loading) this.fetch();
  },

  onPullDownRefresh() {
    this.fetch().finally(() => wx.stopPullDownRefresh());
  },

  async fetch() {
    try {
      const view = await getHome({});
      this.setData({
        loading: false,
        store: view.store,
        cardProducts: view.cardProducts,
        filed: view.store.filingStatus === 'FILED',
        lockedCount: view.cardProducts.filter((p) => !p.listed).length,
      });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[mall] 加载失败', e);
      wx.showToast({ title: '加载失败，下拉重试', icon: 'none' });
    }
  },

  onProductTap(e: WechatMiniprogram.TouchEvent) {
    const { id, listed } = e.currentTarget.dataset as { id: string; listed: string };
    if (listed !== 'true') {
      wx.showToast({ title: '备案完成后开售', icon: 'none' });
      return;
    }
    // 游客能看卡种，下单要登录 —— 匿名浏览的边界在这里
    if (!getMemberSession()) {
      wx.showToast({ title: '登录后可购卡', icon: 'none' });
      return;
    }
    wx.showToast({ title: `下单 ${id}`, icon: 'none' });
  },

  /** 合规公示（PAY-05）：细则第九条要求显著位置 */
  onDisclosureTap() {
    const s = this.data.store;
    if (!s) return;
    wx.showModal({
      title: '合规公示',
      content: `${s.legalEntity}\n统一社会信用代码 ${s.uscc}\n投诉电话 ${s.hotline}`,
      showCancel: false,
    });
  },
});
