/**
 * 教练详情（PQ-1）：私教角标的落地页。
 *
 * PT-04（完整私教预约：选时段、下单）依赖教练排班表 PT-03，本期不做（R7 已定）。
 * 但点击角标后什么都没有会削弱体验，所以先做认知层：擅长方向、可带教项目、教龄，
 * 底部引导联系前台 —— "先打通认知，再打通交易"。
 *
 * 数据取自首页已加载的 rg_home().coaches，不额外发请求（列表页已带全量字段）。
 */
import { getHome } from '../../services/api/home';

const SCOPE_LABEL: Record<string, string> = {
  BOULDER: '抱石',
  TOPROPE: '顶绳保护',
  LEAD: '先锋',
};

Page({
  data: {
    loading: true,
    coachId: '',
    coach: null as any,
    hotline: '',
  },

  onLoad(options: { id?: string }) {
    if (!options.id) {
      wx.showToast({ title: '缺少教练 ID', icon: 'none' });
      return;
    }
    this.setData({ coachId: options.id }, () => this.fetch());
  },

  async fetch() {
    try {
      const view = await getHome({});
      const raw =
        (view.coaches || []).find((c) => c.id === this.data.coachId) || null;
      // 枚举转中文在这里算好：WXML 调不了 TS 方法
      const coach = raw
        ? {
            ...raw,
            scopeLabels: (raw.qualScope || []).map((s) => SCOPE_LABEL[s] || s),
            // specialtyLabel 是服务端拼好的 "A / B" 字符串，这里拆成数组供 wx:for 使用
            specialtyLabels: String(raw.specialtyLabel || '')
              .split('/')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : null;
      this.setData({
        loading: false,
        coach,
        hotline: (view.store && view.store.hotline) || '',
      });
      if (coach) wx.setNavigationBarTitle({ title: coach.nickname });
    } catch (e) {
      this.setData({ loading: false });
      console.error('[coach] 加载失败', e);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    }
  },

  /** 联系前台预约（HOME-07：服务端已给出门店热线） */
  onCallTap() {
    const tel = this.data.hotline;
    if (!tel) {
      wx.showToast({ title: '暂无前台电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: tel });
  },

});
