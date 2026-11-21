/**
 * 自定义 tabBar：首页 / 场馆 / 购卡 / 我的。
 *
 * 四个入口对应四类意图：
 *   首页 —— 来了能干什么（课表时间轴为主体）
 *   场馆 —— 这家店在哪、还有哪些店（多店品牌的门面）
 *   购卡 —— 买卡
 *   我的 —— 通行证与我的卡
 *
 * ⚠️ items 的顺序必须与 app.json 的 tabBar.list 完全一致，
 * 页面里的 syncTabBar(this, index) 也按同一序号传值。
 *
 * 早期版本把「通行证」做成固定的中间凸起，理由是"准入是立身之本"。
 * 但通行证本质是「我的」页面里的一项内容，不是独立 Tab；
 * 到店出示的入口放在首页「我的今日」卡片上更直接 ——
 * 那里才是用户真正要掏码的时刻。
 *
 * 现在凸起改为表达「你在这一页」：选中项的图标上浮成实心气泡。
 * 凸起不再是某个 Tab 的固有属性，所以 items 里不需要 rise 标记。
 */
Component({
  options: { addGlobalClass: true },

  data: {
    active: 0,
    items: [
      { path: '/pages/index/index', text: '首页' },
      { path: '/pages/venue/venue', text: '场馆' },
      { path: '/pages/mall/mall', text: '购卡' },
      { path: '/pages/me/me', text: '我的' },
    ],
  },

  methods: {
    setActive(index: number) {
      this.setData({ active: index });
    },

    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number((e.currentTarget.dataset as { index: string }).index);
      const item = this.data.items[index];
      if (!item) return;

      // 不用 `index === active` 提前 return：active 依赖页面在 onShow 里同步，
      // 一旦某个页面漏了同步，这条守卫就会把正常的 tab 切换误判成重复点击而拦死
      // （曾导致「进商城后回不了首页」）。switchTab 对当前页本身是幂等的，
      // 交给它处理更安全；同时乐观更新选中态，避免等页面 onShow 的视觉延迟。
      const prev = this.data.active;
      this.setActive(index);
      wx.switchTab({
        url: item.path,
        // 跳转失败则回滚到点击前的选中态，不让高亮停在没去成的 tab 上。
        // 必须用事先存下的 prev —— 此时 this.data.active 已被乐观更新成 index。
        fail: () => this.setActive(prev),
      });
    },
  },
});
