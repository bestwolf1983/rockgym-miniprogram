# rockgym-miniprogram

岩馆经营小程序的会员端原型，个人业余探索项目。原生微信小程序 + TypeScript，自定义 tabBar，共 6 个页面：首页、场馆、购卡、我的、教练、管理端。

> 本仓库不含任何真实凭据或环境标识。AppID、云环境 ID 与客户端 Key 都放在被忽略的本地私有配置里；仓库内只有占位模板。

## 快速开始

1. 克隆仓库。
2. 复制私有配置模板并填入你自己的值：

   ```bash
   cp services/config.private.example.ts services/config.private.ts
   ```

   需要填写：`ENV_ID`、`PUBLISHABLE_KEY`、`API_BASE`、`ASSET_CDN_BASE`。

3. 在项目根目录新建 `project.private.config.json`，写入你自己的 AppID：

   ```json
   { "appid": "wxyourappid" }
   ```

   `project.config.json` 里的 `appid` 是占位值；微信开发者工具会优先读取 `project.private.config.json`。

4. `npm install`（可选，仅提供 TypeScript 类型与编译插件）。
5. 用微信开发者工具「导入项目」选择本目录，确认 AppID 已生效。
6. 在微信公众平台后台配置 `request` 合法域名（云函数 HTTP 入口）和 `downloadFile` 合法域名（静态图片 CDN），均指向你自己的环境。

> 需要自备个人主体的小程序 AppID 与一个 CloudBase 环境；仓库不附带可用的线上环境。

## 配置说明

| 值 | 存放位置 | 是否进仓库 |
| --- | --- | --- |
| AppID | `project.private.config.json` | 否 |
| `ENV_ID` / `PUBLISHABLE_KEY` / `API_BASE` / `ASSET_CDN_BASE` | `services/config.private.ts` | 否 |
| 占位模板 | `services/config.private.example.ts`、`.env.example` | 是 |

`PUBLISHABLE_KEY` 是 CloudBase 的客户端匿名凭证（role=anon），设计上可公开，数据安全由数据库 RLS 保证：业务表仅授予只读 SELECT，anon 的写权限已撤销。**严禁换成服务端 API Key（service_role）**，那等同管理员权限。

小程序代码包可被反编译，前端不放任何服务端密钥；服务端凭据一律由环境变量注入。

## 目录

- `pages/` — 6 个页面
- `components/`、`custom-tab-bar/` — 业务组件与自定义 tabBar
- `services/` — 配置、网关、身份、网络日志
- `scripts/pre-publish-check.sh` — 发布前凭据自检

## 发布前自检

```bash
./scripts/pre-publish-check.sh
```

检查提交邮箱、敏感文件、密钥内容、历史作者、依赖源与开源交付件。提交钩子会自动执行暂存区版本；本机装有 gitleaks 时会自动启用深度扫描。

## License

MIT，见 [LICENSE](LICENSE)。
