# Siyin's Blog

我的个人博客，使用 Hexo 搭建，部署在 GitHub Pages。

博客地址：[https://20010903.xyz](https://20010903.xyz)

本仓库保存 Hexo 源码，包括文章、图片、配置和修改后的 A4 主题。GitHub Actions 自动生成网页并发布；生成结果不提交到主分支。现有文章的永久链接保持不变。

## 本地写作与预览

使用 Node.js 24。首次下载或依赖变更后运行：

```bash
npm ci
```

开始修改前先同步远端（定时任务会更新统计快照）：

```bash
git pull --rebase
```

照常使用 Hexo 命令：

```bash
npx hexo new "文章标题"
npm run server
npm run build
```

文章位于 `source/_posts/`，主题配置为 `_config.A4.yml`，主题定制位于 `themes/A4/`。主题直接保存在本仓库中，无需另外克隆或初始化子模块。

文章头部的 `date` 为发布时间，`updated` 为最近修改时间（北京时间）。修改已有文章时按需要更新 `updated`；构建不会将更新时间改为当次运行时间。已发布文章尽量保留 `permalink`，避免影响旧链接、评论和访问统计。

## 发布

检查预览后提交并推送源码：

```bash
git add .
git commit -m "更新博客"
git pull --rebase
git push origin main
```

推送后在 Actions 查看 **Deploy blog**。构建成功后发布到原来的域名；构建失败时保留上次已上线的网页。

**不再使用 `hexo d`、`hexo g -d` 或旧的生成网页部署目录。** 这些旧方式会把生成结果推到源码分支，因此已移除 Git 部署插件和对应配置。`hexo g`、`hexo s` 仍可正常使用。

## 自动发布与统计

Pages 的发布来源保持 **GitHub Actions**。源码推送、每小时统计更新、手动触发都由同一个工作流处理，并共用 `pages` 并发组。网页只从构建目录 `public/` 上传到 Pages。

访问统计继续使用 GoatCounter 与同域快照。接口失败时保留已有数字，不阻止正常发布。详细说明见 [ANALYTICS.md](ANALYTICS.md)。

`node_modules/`、`public/`、`db.json`、旧部署目录和本机编辑器配置不纳入版本管理。
