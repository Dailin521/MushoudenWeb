# Team Platypus 官网

《猛将三国》开发团队 Team Platypus 的中英文静态官网。采用 Astro + TypeScript，以 Team Cherry 官网的红白配色、图文交替新闻布局为参考。

## 本地启动

需要 Node.js **22.23.4 及以上**（本次使用 24.11.1）和 npm。

```powershell
cd E:\GitHubProject\MushoudenWeb
npm ci
npm run dev
```

默认地址：<http://127.0.0.1:4321/>。端口占用时以终端实际显示的地址为准。首次克隆已包含新闻快照及优化后的图片，不需要本地 Unity 工程也能运行。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同步 Steam 公告，启动开发服务 |
| `npm run sync:steam` | 手动刷新中英文公告及其图片 |
| `npm run check` | Astro / TypeScript 检查 |
| `npm test` | 新闻同步、清洗、缓存及失败回退测试 |
| `npm run build` | 同步公告，生成静态站点到 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run assets:prepare` | 重新导入游戏宣传素材，通常无需执行 |

## 页面和内容维护

中文首页 `/`，英文首页 `/en/`。两种语言均包含 `games/`、`about/`、`contact/`、`news/<事件ID>/` 和 `news/page/<页码>/`。原 `community/` 地址跳转至对应语言的 `contact/`，兼容根路径和 GitHub Pages 子路径。每页 5 条新闻，语言切换保留文章 ID 和页码。

- 品牌、文案、运营公司和联系邮箱：`src/lib/site.ts`。
- 公共布局和样式：`src/layouts/Layout.astro`、`src/styles/global.css`。
- 页面主体：`src/components/`，中英文复用相同模板。
- 新闻快照：`src/data/news.json`；游戏图片和预告片配置：`src/data/game.json`。
- 正式域名：复制 `.env.example` 为 `.env`，填写 `SITE_URL`。配置后构建会生成绝对 canonical、语言和分享图片地址。未配置时不伪造生产域名。

工作室使用 Team Platypus 文字标识，由**南京瑞奇网络科技有限公司**运营；关于页、联系页和页脚统一展示运营主体。联系方式仅保留 **13956648@qq.com**，通过 `mailto:` 链接打开邮件客户端。页头、联系页和页脚不展示社交平台、群号或加群入口。游戏购买和公告原文仍链接至 Steam，导入的历史公告保留官方原文。

## Steam 新闻同步

只在 Node 构建/同步阶段请求 Steam，浏览器直接读取已生成的静态页面和本地图片。

- 中文：<https://store.steampowered.com/feeds/news/app/3285500/?l=schinese>
- 英文：<https://store.steampowered.com/feeds/news/app/3285500/?l=english>
- 游戏：<https://store.steampowered.com/app/3285500/>

使用新闻 URL 末尾事件 ID 合并双语，不使用另一套 `ISteamNews` 公告 GID。当前 RSS 每种语言提供最近 10 篇；同步更新同 ID 的内容，并保留退出 RSS 的既有文章。因此请将 `src/data/news.json` 和 `public/media/news/` 一并保存到版本库，累计历史依赖这些快照。

单个语种请求失败时保留该语种旧内容；两个源均失败但已有可用快照时，命令打印警告并继续。没有快照且两个源均失败时退出报错。已有快照损坏时直接报错并保留原文件，避免覆盖历史。请求有超时、重试和体积限制。

远端 HTML 只保留经过清洗的基础内容。新闻图片仅允许来自 Steam CDN，下载并压缩为最大边 1600px 的 WebP；动图保留全部帧、帧时长及循环信息。轮播转为普通图片。正文图片缺失时使用本地游戏 CG；没有封面的更新日志使用小尺寸维修工具图标 `public/media/news/fix.svg`，不显示 FIX 文字。图标来自 Heroicons（MIT，许可见同目录 `repair-icon.LICENSE.txt`）。图片来源记录在 `public/media/news/sources.json`。

`public/media/news/cache-versions.json` 记录图片处理版本。同步会刷新旧版本的缓存（包含已退出 RSS 的历史图片），成功后原子替换；刷新失败继续使用原有图片，下次重试。请将此文件与图片一并保存到版本库。

官方两种语言公告可能内容不同，本站分别保留来源文本，不做自动机器翻译。若一个事件缺少某语种，则显示可用原文并标注语言。官方英文 RSS 本身偶尔含中文标题，本站保留官方标题。

## 素材

- 项目美术来源：`E:\rich\Mushouden\Code\Mushouden\Assets\Res\切图\CG`。使用赵云、沙盘及交锋 CG，读取来源文件后在网站内生成 WebP。
- 实机截图、当前商店宣传图和预告片来自 Steam 商店公开素材。只使用公开截图，不使用含占位文字的设计稿。
- 网站图片：`public/media/game/`，逐项来源见该目录的 `sources.json`。
- 重新导入时可设置 `MUSHOUDEN_ASSET_ROOT` 指向对应 CG 目录，再运行 `npm run assets:prepare`；该命令需要来源文件和网络，不会修改游戏工程。
- 游戏预告片使用 Steam 官方 HLS。只有点击播放时才下载播放器与视频，失败时保留前往 Steam 的入口。预告片源变更后可重新导入素材更新配置。

游戏及工作室美术、商标和公告归各自权利人所有；仓库未为这些素材授予额外许可。

## 赵云 GPU 动画

中英文游戏页的主视觉使用 `ZhaoyunHero.astro`。它读取烘焙后的顶点动画纹理（VAT），由 WebGL 2 顶点 shader 读取前后两帧并插值，单次 draw call 绘制角色；浏览器没有 Spine 骨骼计算或逐帧网格上传。`open` 入场后播放 `anima_01`，每 2～3 次穿插 `anima_02/03/04`，动作之间做 0.2 秒过渡。

转换参考 `E:\NewRich\TowerDefense\Code\TowerDefense\Assets\Plugins\SpineToUnity\Editor\SpineMeshBaker.cs` 中的 `SpineMeshGpuBaker` 和 `Runtime/SpineMeshGpu.shader`：离线采样世界坐标、保留关键帧、GPU 选帧和插值。赵云没有换附件、透明度或绘制顺序时间轴，因此 UV、颜色和索引固定；无需通用角色的颜色纹理、动态布局纹理与实例化。和 StartScene 的 `SkeletonGraphic` 一致，不使用 Spine clipping。

源资源来自 `E:\rich\Mushouden\Code\Mushouden\Assets\Res\Spine\开始界面\开始界面切图.*`，只读取 `.skel.bytes`、`.atlas.txt` 和 `.png`。原始版本为 Spine 3.8.75；离线使用未修改的 `@pixi-spine/runtime-3.8` 解析（会输出旧版本提示），浏览器不加载该运行库。第三方许可见 `licenses/Spine-Runtimes.txt`。

```powershell
# 可选：源文件换位置时设置此目录
$env:MUSHOUDEN_SPINE_ROOT='E:\rich\Mushouden\Code\Mushouden\Assets\Res\Spine\开始界面'
npm run assets:bake-zhaoyun
```

生成的 `src/data/zhaoyun-gpu.json` 和 `public/media/spine/zhaoyun/` 必须一起提交。普通构建和 GitHub Actions 直接使用这些产物，不需要 Unity 或源工程。资源文件名带内容哈希；重新烘焙后可删除该目录中清单不再引用的旧文件。

当前为 27 个网格、3136 个顶点、5 段动画、854 帧（30 fps 加原始关键帧）。位置以 16 位整数编码，差分和 gzip 后约 3.67 MB；图集约 2.78 MB，网格约 0.15 MB。只在游戏页进入视野时加载，初始化时解压并上传一次。烘焙脚本逐帧测量量化误差，并将每个采样区间的中点插值与原始 Spine 网格比较；本次最大误差约 0.59 原素材像素，报告在 `output/zhaoyun-gpu-validation.json`。

支持暂停/继续、离开视野或切到后台时停止绘制。启用减少动态效果时先显示静态图，可手动播放；WebGL 2 不可用或资源加载失败时也保留静态图。

## 验证与 GitHub Pages 部署

```powershell
npm run check
npm test
npm run build
npm run preview
```

预览地址：<https://dailin521.github.io/MushoudenWeb/>，英文版：<https://dailin521.github.io/MushoudenWeb/en/>。

`.github/workflows/deploy.yml` 在推送 `main` 或手动触发时执行检查、测试、构建，再发布 `dist/` 到 GitHub Pages。仓库 Settings → Pages 的 Source 使用 GitHub Actions。构建设置 `SITE_URL=https://dailin521.github.io`、`BASE_PATH=/MushoudenWeb`；导航、图片、新闻正文与分享链接均支持该子路径。本地不设置这些变量时仍使用根路径。部署到独立域名时修改 SITE_URL，并去掉 BASE_PATH。

Steam 新闻在本地启动与每次部署构建前同步。需要更新线上新闻时，可在 GitHub Actions 手动运行部署；历史快照仍应通过本地同步后提交 `src/data/news.json` 与 `public/media/news/` 来持久保存。网站没有依赖在线 CMS、数据库或登录后台。

本地验收截图保存在忽略目录 `output/playwright/`，新闻与素材源文件保存在仓库中。
