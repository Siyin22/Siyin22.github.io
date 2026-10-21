# 访问统计（GoatCounter）

本站使用 GoatCounter 的免费托管服务，同时显示首页的全站统计和文章统计。

1. 在 https://www.goatcounter.com/signup 注册，站点域名填写 `20010903.xyz`。
2. 在站点 Settings 中开启 **Allow adding visitor counts on your website**。
3. 在 `_config.a4.yml` 的 `analytics.goatcounter.siteUrl` 填入自己的站点地址，例如 `https://siyin.goatcounter.com`。这里填写的是 GoatCounter 地址，不是博客域名，不需要 API 密钥。
4. 运行 `npm run build` 检查；确认后提交并推送源码，由 GitHub Actions 自动构建和发布。

页面优先读取博客同域的 `stats/visits.json` 统计快照，因此浏览器无法跨域读取 GoatCounter 时仍能显示最近成功获取的数字。计数后面显示 `（截止2026-10-2 21:00）`，时间统一使用北京时间：快照采用对应计数的 `updatedAt`，直接获取接口数据时采用本次成功获取的时间。该时间表示最近获取时间，服务自身可能存在缓存延迟。外部接口能访问时，会用接口返回的数字和获取时间更新显示。快照由 GitHub Actions 每小时自动获取并发布，不需要额外账号或密钥。GitHub 的定时任务可能延迟，GoatCounter 自身的计数缓存也仍然适用。

工作流和更新脚本位于根目录 `.github/`，不进入生成的网站。`public/stats/visit-counter-config.json` 在构建时自动生成，包含首页总计与所有文章的路径，新增文章后会自动纳入定时更新。Actions 构建后运行 `node .github/scripts/update-visit-counts.mjs public`，成功时把新快照保存回 `source/stats/visits.json`，并提交到源码仓库供后续构建复用。更新失败时保留已知的计数，不会覆盖成零，也不会阻止网站发布。GitHub Pages 的发布来源须设为 **GitHub Actions**，推送到 `main`、每小时定时任务及手动操作都由同一个 **Deploy blog** 工作流处理，整个流程共用 `pages` 并发组。排队任务始终检出最新的 `main`；保存统计时如遇新的源码推送，会让后续任务发布新内容。保存统计所用的 `GITHUB_TOKEN` 不会再次触发此工作流。

本地仍照常使用 `hexo g` 生成、`hexo s` 预览，发布改为提交并推送源码，不再使用 `hexo d`。推送后由 Actions 自动构建并上线。可在 GitHub Actions 中手动运行 **Deploy blog**。写作前先 `git pull --rebase` 同步统计快照。仓库长期无活动时，GitHub 可能暂停定时工作流，可在 Actions 页面重新启用。

`indexInfo.allViewCount` 控制首页显示，`postInfo.viewCount` 控制文章显示；两者都关闭时不加载统计。只关闭首页显示时，其余页面仍会被统计，以便后台数据完整。站点地址留空时不显示计数、不加载统计。

计数从接入后开始积累，不蒜子的旧数据不会自动迁移。公开计数接口最多缓存 4 小时，新站点/文章可能需要等待数据出现。页面按 GoatCounter 的公开计数口径显示；它会过滤机器人，统计结果可能与不蒜子不同。尚无访问记录的文章会返回 HTTP 404 和合法的 `count: "0"`，页面对此显示 `0次`。其他接口失败或超时显示“暂不可用”，不会把失败当成零。浏览器关闭 JavaScript 时也显示“暂不可用”。加载错误会记录到浏览器控制台。

本地预览不记录访问；通过博客地址访问时，每次页面加载由官方脚本提交一次统计。查询参数不拆分计数。跟踪与远程计数请求使用公开端点，不在浏览器中保存管理凭据。统计脚本异步加载，避免主题中的其他外部脚本阻塞计数。统计上报仍需访问 GoatCounter；浏览器或网络拦截上报时，该次访问可能不会进入统计，同域快照只改善数字显示的可靠性。

官方 `count.js` 随博客部署到 `js/goatcounter-count.js`，避免运行时依赖脚本 CDN。来源：https://gc.zgo.at/count.js（2026-10-02），遵循脚本中的 ISC 许可说明。需要更新时从该地址替换本地文件。

官方计数接口说明：https://www.goatcounter.com/help/visitor-counter 。GoatCounter 仍是外部服务，境内不同网络的访问质量需要观察。
