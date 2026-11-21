/**
 * 真机网络诊断：记录 `wx.request` 的原始结果。
 *
 * 为什么需要它
 * ---------------------------------------------------------------------------
 * @cloudbase/js-sdk 在请求失败时抛的是自己的 `FetchError`，message 是空的
 * （真机上表现为 `FetchError: undefined`）。真正的失败原因只存在于
 * `wx.request` 的 fail 回调里：
 *     request:fail url not in domain list   ← 域名没配 / 缓存没清
 *     request:fail ssl hand shake error     ← 证书 / 系统时间
 *     request:fail timeout                  ← 网络不通
 * 所以要在 SDK 之下再垫一层，把原始 errMsg 记下来。
 *
 * ⚠️ 必须在任何请求发生之前安装（app.ts onLaunch 里，早于 getDB()）。
 *
 * 演示期保留；上线前删掉调用即可（不影响业务逻辑，纯旁路记录）。
 */

interface NetRecord {
  url: string;
  ok: boolean;
  statusCode?: number;
  errMsg?: string;
  ms: number;
  at: number;
}

/** 只留最近 20 条，真机排查够用且不占内存 */
const MAX_RECORDS = 20;
const records: NetRecord[] = [];
let installed = false;

function push(r: NetRecord) {
  records.push(r);
  if (records.length > MAX_RECORDS) records.shift();
}

export function installNetLog(): void {
  if (installed) return;
  installed = true;

  const raw = wx.request.bind(wx) as (o: WechatMiniprogram.RequestOption) => WechatMiniprogram.RequestTask;
  (wx as unknown as { request: typeof wx.request }).request = ((opt: WechatMiniprogram.RequestOption) => {
    const started = Date.now();
    const url = String(opt?.url ?? '');
    const { success, fail, complete } = opt;

    return raw({
      ...opt,
      success: (res) => {
        push({ url, ok: true, statusCode: res.statusCode, ms: Date.now() - started, at: Date.now() });
        success?.(res);
      },
      fail: (err) => {
        const e = err as { errMsg?: string };
        push({ url, ok: false, errMsg: e?.errMsg || String(err), ms: Date.now() - started, at: Date.now() });
        fail?.(err);
      },
      complete: (res) => complete?.(res),
    });
  }) as typeof wx.request;
}

/** 一句话概况：发了几次、失败几次 */
export function netSummary(): string {
  const failed = records.filter((r) => !r.ok).length;
  return `请求 ${records.length} 次 · 失败 ${failed} 次`;
}

/**
 * 本次会话请求过的全部域名（去重，带次数）。
 *
 * 用途：真机调试（不校验域名）下跑一次，把这里列出的域名照抄进微信后台的
 * request 合法域名 —— 一次 RPC 可能跨鉴权与数据两个域名，配漏一个就会
 * 在预览/体验版上失败。
 */
export function allHosts(): string {
  const map = new Map<string, number>();
  records.forEach((r) => {
    let host = r.url;
    try {
      host = r.url.replace(/^https?:\/\//, '').split('/')[0];
    } catch {
      /* 保持原样 */
    }
    map.set(host, (map.get(host) ?? 0) + 1);
  });
  if (!map.size) return '';
  return [...map.entries()].map(([h, n]) => `${h}(${n})`).join(' , ');
}

/**
 * 失败请求涉及的所有域名（去重）。
 *
 * SDK 一次调用可能打多个域名（鉴权、RPC 分开），只报最后一个会把其它漏掉 ——
 * 白名单要配的是**全部**打过的域名，所以这里把失败过的 host 全列出来。
 */
export function failedHosts(): string {
  const hosts = new Set<string>();
  records
    .filter((r) => !r.ok)
    .forEach((r) => {
      try {
        hosts.add(r.url.replace(/^https?:\/\//, '').split('/')[0]);
      } catch {
        /* 忽略异常 URL */
      }
    });
  return [...hosts].join(' , ');
}

/** 最近一次失败的原始 errMsg（真机排查的关键信息） */
export function lastNetError(): string {
  if (!records.length) return '没有发出任何请求（失败发生在发请求之前）';
  const bad = [...records].reverse().find((r) => !r.ok);
  if (!bad) return '所有请求均已发出，未出现网络层失败';

  // 带上域名（只保留 host，避免错误行太长被截断）
  let host = bad.url;
  try {
    host = bad.url.replace(/^https?:\/\//, '').split('/')[0];
  } catch {
    /* 保持原样 */
  }
  return `${bad.errMsg} · ${host} · ${bad.ms}ms`;
}
