/**
 * 今日课表时间轴 —— 散客首屏主体。
 *
 * 产品判断：大多数散客注册后不约课。对他们，"这里能学什么"远比"约课入口"重要。
 * 所以本组件承担内容种草职责，展示重点依次是：
 *   难度档（自我归类）→ 具体教学动作（勾起好奇）→ 教练（复购跟人走）→ 名额。
 *
 * 组件不做任何可约性判断：能不能约由服务端 AdmissionService + 容量双池计算后
 * 直接返回 cta 的文案与形态，前端只渲染。
 */
export interface TimelineCoach {
  id: string;
  /** 昵称而非真名 —— 教练无义务向所有散客暴露实名 */
  nickname: string;
  avatarUrl: string;
  /** "动态动作专精 · 4 年教龄" */
  tagline: string;
  /** 店长可标记主推教练 */
  featured: boolean;
}

export interface TimelineEntry {
  id: string;
  /**
   * 服务端仍可能下发 FREE_CLIMB（自由攀爬时段已于 2026-09-25 下线，老板确认）。
   * 前端一律跳过不渲染 —— 见 index.wxml 里的 block wx:if；
   * 类型保留是因为它还描述着服务端的数据契约，等服务端不再下发时再删。
   */
  kind: 'COURSE' | 'FREE_CLIMB';
  timeLabel: string;
  durationLabel: string;
  /** past | live | upcoming，服务端按门店时区计算，客户端不算时间 */
  state: 'past' | 'live' | 'upcoming';
  /** beginner | intermediate | advanced，决定配色 */
  tone: 'beginner' | 'intermediate' | 'advanced' | 'none';
  gradeLabel: string;
  title: string;
  /** ★ 具体教学动作，如 ['三脚猫','甩腿','dyno']。顺序即课上讲授顺序 */
  highlights: string[];
  coach: TimelineCoach | null;
  seat: {
    enrolled: number;
    capacity: number;
    percent: number;
    /** normal | hot | full | memberOnly（散客满但会员可约，OPS-12） */
    level: 'normal' | 'hot' | 'full' | 'memberOnly';
    label: string;
  } | null;
  /** 服务端决定的行动按钮，前端不推导 */
  cta: {
    text: string;
    variant: 'primary' | 'ghost' | 'wait' | 'mine' | 'done';
    path: string;
    disabled: boolean;
  };
  /** 我已预约的课次高亮 */
  mine: boolean;
}

Component({
  options: { addGlobalClass: true, virtualHost: true },

  properties: {
    entries: { type: Array, value: [] as TimelineEntry[] },
    /** 当前时刻指示线插在第几项之后，-1 表示不显示 */
    nowAfterIndex: { type: Number, value: -1 },
    nowLabel: { type: String, value: '' },
    /** 游客（未登录）：预约类入口只提示登录，不跳转 */
    visitor: { type: Boolean, value: false },
  },

  methods: {
    /**
     * 游客点预约：给明确的下一步，而不是"点了没反应"。
     * 匿名可浏览、约课需登录 —— 这是产品边界，提示语即引导。
     */
    onEntryTap(e: WechatMiniprogram.TouchEvent) {
      if (this.data.visitor) {
        wx.showToast({ title: '登录后可预约课程', icon: 'none' });
        return;
      }
      const { id } = e.currentTarget.dataset as { id: string };
      wx.navigateTo({
        url: `/pkg-booking/courses/courses?sessionId=${id}`,
        fail: () => wx.showToast({ title: '课程详情开发中', icon: 'none' }),
      });
    },

    onCtaTap(e: WechatMiniprogram.TouchEvent) {
      if (this.data.visitor) {
        wx.showToast({ title: '登录后可预约课程', icon: 'none' });
        return;
      }
      const { path, disabled } = e.currentTarget.dataset as { path: string; disabled: string };
      if (disabled === 'true') return;
      // 服务端给的是业务路径（如 /book/cs_1800），这里映射成小程序页面路由
      const m = /^\/\w+\/(.+)$/.exec(path || '');
      const url = m ? `/pkg-booking/courses/courses?sessionId=${m[1]}` : path;
      wx.navigateTo({ url, fail: () => wx.showToast({ title: '预约功能开发中', icon: 'none' }) });
    },

    /** 点教练进个人页：复购跟人走，这条路径要短 */
    onCoachTap(e: WechatMiniprogram.TouchEvent) {
      const coachId = (e.currentTarget.dataset as { coachId: string }).coachId;
      wx.navigateTo({
        url: `/pkg-booking/coach/coach?id=${coachId}`,
        fail: () => wx.showToast({ title: '教练主页开发中', icon: 'none' }),
      });
    },
  },
});
