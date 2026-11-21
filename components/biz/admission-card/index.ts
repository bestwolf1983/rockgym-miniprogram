/**
 * 通行证状态卡 —— 首页视觉重心，全站唯一允许使用大面积状态色的组件。
 *
 * 关键设计：卡片底色、状态灯、主按钮文案与去向全部由服务端返回的准入结论驱动。
 * 组件自身不做任何准入判断 —— 判定只存在于后端 AdmissionService.evaluate()，
 * 前端复制一份判断逻辑，就会出现"约课能约、到店进不去"的投诉。
 */
type AdmissionLight = 'GREEN' | 'YELLOW' | 'RED' | 'GRAY';

interface QualChip {
  label: string;
  kind: 'pass' | 'warn' | 'block' | 'off';
}

interface AdmissionView {
  /** 服务端计算的展示状态，前端只做映射 */
  state: 'none' | 'pending' | 'expired' | 'pass';
  light: AdmissionLight;
  title: string;
  quals: QualChip[];
  /** 已是服务端组装好的展示文案，前端不拼装业务语义 */
  metaLines: string[];
  action: { text: string; path: string; tone: 'primary' | 'warn' | 'block' };
  /** 待确认消费笔数（PAY-02），> 0 时显示顶部黄条 */
  pendingConfirmCount: number;
}

Component({
  options: {
    // Skyline 下 addGlobalClass 用于让外部传入的布局类生效
    addGlobalClass: true,
    virtualHost: true,
  },

  data: {
    /**
     * 是否 Skyline 渲染。
     *
     * 决定卡片头部要不要用 <share-element> —— 那是 Skyline 专属组件，
     * WebView 下没有它，会被解析成 wx://not-found 并让整棵树渲染失败。
     * 关掉只是丢了"卡片放大成一屏"的转场动效，功能不受影响。
     */
    isSkyline: false,
  },

  lifetimes: {
    attached() {
      // 渲染模式在 app.ts 的 detectRenderMode() 里已经算好，这里只读结论
      const g = (getApp() as any)?.globalData;
      this.setData({ isSkyline: g?.renderMode === 'skyline' });
    },
  },

  properties: {
    admission: {
      type: Object,
      value: null as AdmissionView | null,
    },
    loading: {
      type: Boolean,
      value: true,
    },
  },

  methods: {
    onActionTap() {
      const a = this.data.admission as AdmissionView | null;
      if (!a) return;
      // 错误即引导：不弹 toast，直接把用户送到能解决问题的页面。
      // 目标页尚未创建时降级为提示，页面建好后这里自动生效，无需改动。
      wx.navigateTo({
        url: a.action.path,
        fail: () => wx.showToast({ title: a.action.text, icon: 'none' }),
      });
    },

    onConfirmTap() {
      wx.navigateTo({
        url: '/pkg-misc/confirm/confirm',
        fail: () => wx.showToast({ title: '消费确认功能开发中', icon: 'none' }),
      });
    },

    /**
     * 共享元素转场：卡片"放大成一屏"。
     * 这是不做跨平台换来的体验收益之一，Taro/uni-app 下拿不到。
     */
    onCardTap() {
      const a = this.data.admission as AdmissionView | null;
      if (a?.state !== 'pass') return;
      wx.navigateTo({
        url: '/pages/pass/pass',
        fail: () => wx.showToast({ title: '入场码功能开发中', icon: 'none' }),
      });
    },
  },
});
