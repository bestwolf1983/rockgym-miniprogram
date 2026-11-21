/**
 * 运行时配置。环境相关常量集中在此，不散落在各 service。
 *
 * 真实值统一从 ./config.private 读取 —— 该文件已被 .gitignore 忽略，
 * 仓库内只保留 config.private.example.ts 占位模板。首次 clone 请先复制模板并填写。
 *
 * ⚠️ 关于 PUBLISHABLE_KEY 的安全边界
 * ---------------------------------------------------------------------------
 * 这里放的是 CloudBase 的**客户端 Publishable Key**，设计上就是可公开的客户端凭证
 * （其 JWT 载荷为 role=anon / scope=anonymous）。它出现在代码中是可接受的 ——
 * 数据安全并不由它保证，而由**数据库侧的 RLS** 保证：
 *   1. 已撤销 anon 的 INSERT / UPDATE / DELETE / TRUNCATE
 *   2. 全部业务表已开启行级安全（RLS），仅授予只读 SELECT 策略
 *
 * 也就是说：即使有人拿到这个 Key，也只能读数据，改不了、删不掉。
 *
 * 严禁替换成「服务端 API Key」（role=service_role）—— 那等同管理员权限，
 * 一旦进入客户端，RLS 形同虚设。
 *
 * 更稳妥的做法是构建期注入；此处改为从私有模块读取，避免真实值进入公开仓库。
 */
import {
  ENV_ID,
  PUBLISHABLE_KEY,
  API_BASE,
  ASSET_CDN_BASE,
} from './config.private';

// 保持原有导出名，其他 service 的引用无需改动。
export { ENV_ID, PUBLISHABLE_KEY, API_BASE, ASSET_CDN_BASE };

/**
 * CloudBase 网关域名 —— 真机上 wx.request 实际打到的 host。
 *
 * ⚠️ 不是 `ap-shanghai.tcb-api.tencentcloudapi.com`：
 * 那个是 Publishable Key（JWT）里 `iss` 的签发域名，看着像业务域名，其实不是。
 * js-sdk v3 走 HTTP 链路时请求的是网关域名，微信后台「request 合法域名」
 * 要配的就是这一个（真机网络日志实测：8 次请求全部落在这个 host）。
 */
export const API_HOST = `${ENV_ID}.api.tcloudbasegateway.com`;

/**
 * 演示开关。
 *
 * true  → 启用演示兜底：身份走白名单、首页显示身份切换器。
 * false → 生产模式：身份必须由服务端下发（见 services/identity.ts）。
 *
 * 上线前必须置 false。
 */
export const DEMO_MODE = true;

// 调用模式说明：所有数据一律经云函数 HTTP 路由（API_BASE + API_PATH）。
// 曾经的 `direct` 直连分支已随 js-sdk 退役一并删除（它依赖端上直连数据库）。

/**
 * 云函数的 HTTP 入口（HTTP 访问服务路由 /api）。
 *
 * ⚠️ 为什么不是 SDK 的 `callFunction`
 * 2026-10-02 起，环境对「客户端调用云函数」这条通道一律返回
 * `EXCEED_AUTHORITY`，且**不受网关 OPA 策略影响** —— 已验证把策略改成
 * `default allow := true` 仍被拒，而服务端 invoke 正常、数据库直连也正常。
 * 所以改走 HTTP 访问服务（同一份函数代码，函数入口已兼容 HTTP 结构）。
 *
 * 代价：这个域名必须加进微信后台的 request 合法域名，否则真机被拦。
 * API_BASE 的真实值见 config.private.ts（由上方 re-export 提供）。
 */
export const API_PATH = '/api';

/**
 * 图片 CDN 前缀（CloudBase 静态托管）。
 *
 * 小程序主包 2MB 上限，图片放包里是浪费 —— 全部迁到静态托管（assets/ 已上传，
 * 路径与仓库内一致，本地备份在仓库根 assets-origin/，不进小程序包）。
 * 库里存的相对路径（assets/coach/coach-01.jpg）由 resolveAssetUrl 拼上此前缀。
 *
 * ⚠️ 真机要求：该域名必须在微信后台「downloadFile 合法域名」里，
 *    否则 <image> 加载被拒（真机强校验；模拟器勾了"不校验域名"可跳过）。
 *
 * ASSET_CDN_BASE 的真实值见 config.private.ts（由上方 re-export 提供）。
 */

// 环境相关常量统一由上方 re-export 提供，此处不再硬编码任何真实值。
