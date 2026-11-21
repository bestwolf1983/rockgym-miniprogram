/**
 * 自定义 tabBar 选中态同步。
 *
 * 自定义 tabBar（app.json 里 tabBar.custom = true）不是全局单例：
 * 每个 tab 页面各自实例化一份组件，切页后拿到的是新实例、data 回到初始值。
 * 所以「当前选中哪个 tab」必须由页面在 onShow 时告诉它。
 *
 * 漏掉这一步会出现方向性失灵：组件 onTap 里有
 *   if (index === this.data.active) return;
 * 这条防重复点击的守卫，而 active 恒为初始值 0，于是「回到首页」
 * 会被误判成重复点击并拦掉 —— 表现为去别的 tab 正常、回首页点不动。
 *
 * getTabBar 的两个注意点：
 *  1. 只在 tab 页面上存在，非 tab 页面调用会是 undefined；
 *  2. 首次 onShow 时组件可能还没挂载完，需要兜底重试一次。
 */
export function syncTabBar(page: WechatMiniprogram.Page.Instance<any, any>, index: number): void {
  const apply = () => {
    const tabBar = (page as any).getTabBar?.();
    if (!tabBar || typeof tabBar.setActive !== 'function') return false;
    tabBar.setActive(index);
    return true;
  };

  // 组件尚未挂载时（首屏冷启动可能命中），下一个微任务再试一次
  if (!apply()) {
    wx.nextTick(() => {
      apply();
    });
  }
}
