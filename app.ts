/**
 * 应用入口。
 *
 * 启动时判定渲染模式：Skyline 不支持的旧机型走 WebView 降级。
 * 降级口径（技术方案 2.4）：功能 100% 可用，动效降级，不算缺陷。
 */
import { installNetLog } from './services/netlog';

/**
 * 是否启用 Skyline 渲染。
 *
 * ⚠️ 这个开关必须与 `project.config.json` / `project.private.config.json` 的
 * `setting.skylineRenderEnable` **手工保持一致** —— 小程序端上没有 API 能读到该配置，
 * 也没有可靠办法探测"当前页面到底跑在哪个渲染器上"。
 *
 * 当前为 false：Skyline 在本项目上曾导致编译器崩溃，暂用 WebView 渲染。
 * 置 true 之前请先确认上述两个配置文件也已打开，否则这里说 skyline、
 * 实际是 WebView，用到 Skyline 专属组件（如 share-element）的页面会直接报
 * `Component is not found in path "wx://not-found"`。
 */
const SKYLINE_ENABLED = false;

App({
  globalData: {
    renderMode: 'skyline' as 'skyline' | 'webview',
  },

  onLaunch() {
    // 网络日志必须最先装：一旦发出请求，就没机会再包住它了
    installNetLog();
    this.detectRenderMode();
    this.checkPrivacy();
  },

  detectRenderMode() {
    const { SDKVersion } = wx.getAppBaseInfo();
    const libOk = compareVersion(SDKVersion, '3.4.0') >= 0;
    // 两个条件都要满足：项目开关打开 + 基础库版本够。
    // 只看版本会误判 —— 本项目基础库够，但 Skyline 是关着的。
    const useSkyline = SKYLINE_ENABLED && libOk;

    this.globalData.renderMode = useSkyline ? 'skyline' : 'webview';
    if (!useSkyline) {
      console.info('[render] webview mode, skylineEnabled =', SKYLINE_ENABLED, ', SDKVersion =', SDKVersion);
    }
  },

  /**
   * 隐私授权（NFR-06 最小必要原则）。
   *
   * ⚠️ 不在启动时主动弹：隐私弹窗应当发生在**用户要用到该能力时**，
   * 而不是一进小程序就拦一道（启动即弹会拉高跳出率，也不符合"最小必要"）。
   *
   * 实际做法：调用隐私接口（如 wx.scanCode）时微信会自动触发授权流程；
   * 这里只做一次状态探测，用于日志排查 —— 真机上"扫码无权限"十有八九
   * 是未授权或后台隐私指引未配置，有这行日志能一眼区分。
   *
   * 原实现跳 /pages/privacy/privacy，但该页面从未创建，必然 fail 后降级成
   * 一句 toast —— 用户看到"请先阅读隐私协议"却无处可读，是死路。故移除。
   */
  checkPrivacy() {
    if (!wx.getPrivacySetting) return;
    wx.getPrivacySetting({
      success: (res) => {
        if (res.needAuthorization) {
          console.info('[privacy] 尚未授权，调用隐私接口时微信会自动弹窗');
        }
      },
    });
  },
});

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}
