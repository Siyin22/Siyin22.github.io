---
title: 把 Bilibili 的翻译模型接进日常工具：Index Translate Bridge
date: 2026-10-18 16:17:17
updated: 2026-10-20 19:18:17
permalink: /integrate-bilibili-translation-model-daily-tools-index-translate-bridge/
categories:
  - AI
tags:
  - AI
  - 翻译
---
## Ⅰ. 前言

### 1. Bilibili 的 Index-Translate 系列模型

Bilibili 于 2026 年 9 月 30 日开源了 **Index-Translate** 系列模型,并于 10 月 4 日正式开放了免费公网 API。B 站为 **Index-Translate** 提供了[在线体验网页](https://index-translate.bilibili.com/?p=/site/translate.html&lang=zh),同时公开了兼容 OpenAI 格式的 API 接口和调用脚本。

### 2. 使用场景

看到翻译模型开放体验,最直接的方式通常是打开网页、粘贴原文、复制译文。这种方式偶尔使用确实方便,但对于需要频繁阅读外文网页、翻译截图的场景,反复切换窗口还是略显繁琐。

我日常在浏览器中使用**陪读蛙**翻译插件,它支持网页翻译、视频字幕翻译、划词翻译、输入翻译等功能,并可接入 AI 服务;截图翻译则使用 **SnowShot** 截图软件,同样支持 AI 接入。

在尝试将 **Index-Translate-35B-A3B** 接入现有工具时,我遇到了直接请求接口报错的情况。经过一番调试,最终将解决方案整理成了一个小工具:**Index Translate Bridge**。

它非常简单,适配 Windows 操作系统,为支持 OpenAI Chat Completions 接口的客户端提供本地转接服务,再将请求转发给 B 站官方的翻译 API。

项目地址:
- **GitHub 仓库:** https://github.com/Siyin22/IndexTranslateBridge
- **下载最新版本:** https://github.com/Siyin22/IndexTranslateBridge/releases/latest

---

## Ⅱ. 工具介绍

### 1. 工作原理

整个工作流程可以理解为:

```
浏览器扩展 / 翻译软件 / 桌面客户端 / 自编写脚本
                        ↓
             本机的 Index Translate Bridge
                        ↓
               B 站 Index-Translate API
                        ↓
                   返回翻译结果
```

其中,负责 API 调用和请求转接的核心来自 [Index-Translate 官方的 call_api.py](https://github.com/bilibili/Index-Translate/blob/main/inference/llm/call_api.py)。我在此基础上补充了 Windows 下的后台启动、一键关闭、进程管理和使用说明,方便日常使用。

启动后,客户端填写的是本机地址:

```
http://127.0.0.1:8080/v1
```

`127.0.0.1` 表示当前这台电脑。本地脚本收到请求后,再向 B 站发起请求,并将结果返回给客户端。

这里的"本地"指的是转接程序。**模型仍运行在 B 站服务器上,翻译需要联网,原文也会发送到官方服务**。因此,无需下载模型权重或为运行 35B 模型准备显卡,但也不支持离线翻译。

### 2. 接入支持

只要工具支持以下功能,都可以通过 **Index Translate Bridge** 接入 **Index-Translate** 系列模型:

- 自定义 API 地址(Base URL)
- 自定义模型 ID
- 使用 OpenAI Chat Completions 协议发送请求

这些选项通常出现在"自定义服务""OpenAI 兼容""添加模型"等设置页面中。

满足条件的浏览器扩展、翻译软件、桌面 AI 客户端,以及自行编写的脚本,都可以按相同的接口信息进行配置。

仓库中保留了陪读蛙和 SnowShot 的配置示例,方便参考不同软件的配置入口。

### 3. 下载、启动与配置

#### 1) 前置条件

目前提供的是 Windows 脚本包,适用于 Windows 10 / 11,需要先安装 **Python 3.10 或更高版本**,无额外 Python 依赖。安装 Python 时,需要启用 Python Launcher,或者勾选 **Add python.exe to PATH**,以便启动脚本能够正常找到 Python。

#### 2) 下载

打开[最新 Release 页面](https://github.com/Siyin22/IndexTranslateBridge/releases/latest),在 Assets 中下载 Windows ZIP 压缩包。以首个版本为例,文件名为:

```
IndexTranslateBridge-v1.0.0-windows.zip
```

#### 3) 启动

解压下载的压缩包,双击运行:

```
Start-IndexTranslate.cmd
```

看到 `Bridge started` 即表示本机转接服务已成功启动。此时可以关闭命令窗口,服务将继续在后台运行。

#### 4) 配置

接下来,在客户端中添加自定义服务:

| 配置项      | 填写内容                         |
| -------- | ---------------------------- |
| 服务名称     | 随意,例如 `Index 翻译`             |
| 接口类型     | OpenAI 兼容 / Chat Completions |
| Base URL | `http://127.0.0.1:8080/v1`   |
| API Key  | `index`                      |
| 模型 ID    | `Index-Translate-35B-A3B`    |

这里的 `index` 是占位文本,并非需要申请的密钥。本机转接服务不验证这个值,也不会将客户端填写的密钥转发给上游。

大多数客户端的 Base URL 填写到 `/v1` 即可。如果软件明确要求填写"完整请求地址",则使用:

```
http://127.0.0.1:8080/v1/chat/completions
```

保存配置、测试连接,然后在客户端中选择刚添加的服务或模型。如果软件有单独的"翻译服务"设置,也需要在那里进行切换。

不需要使用时,双击运行 `Stop-IndexTranslate.cmd` 关闭服务。下次再用时重新启动即可,无需重新配置客户端。电脑重启后也需要手动启动,目前未设置开机自启,如有需求可自行添加。

---

## Ⅲ. 常见问题

### 1. 启动时可能遇到的问题

启动工具后可能遇到以下两种情况:

**情况一:** 如果看到 `Bridge already running`,说明转接服务已在运行,直接关闭窗口即可。

**情况二:** 如果看到 `Port 8080 is used by another program`,表示其他程序占用了该端口,导致转接服务未能启动。此时可以为转接服务更换一个空闲端口,以 `8081` 为例,操作步骤如下:

1. 如果本项目的服务正在运行,先使用关闭脚本停止它
2. 在 `run_bridge.py` 中,将最后一行的 `port=8080` 改为 `port=8081`
3. 在 `launch.py` 中,将所有 `8080` 替换为 `8081`,保存两个文件
4. 重新启动,并将客户端的 Base URL 改为 `http://127.0.0.1:8081/v1`

### 2. 如何验证上游翻译服务可用

本机服务启动成功后,可以在浏览器中访问 `http://127.0.0.1:8080/`。如果显示 `Index-Translate Proxy Ready`,说明本机转接程序已正常工作;如果更改过端口,访问地址也需要相应调整。

### 3. 其他错误排查

如果按照以上步骤操作后,客户端仍显示翻译失败,请检查以下内容:

- 接口类型是否正确
- 模型 ID 是否准确
- 上游返回的错误信息

项目目录中的 `bridge.log` 可以辅助排查问题。常见错误码说明:
- `412` 通常与上游风控有关
- `429` 通常表示请求受到限流

### 4. 免费服务说明

截至本文撰写时(2026 年 10 月 18 日),B 站官方提供免费的公网 API,本项目本身也不收费。但免费额度、服务可用性及后续政策均由上游决定,本地转接工具无法对此作出长期承诺。

---

## Ⅳ. 声明

本项目采用 **Apache License 2.0** 开源协议,官方脚本的来源和许可证说明已一并保留在仓库中。这是一个独立整理的本地转接工具,翻译能力和 API 服务来自 B 站的 **Index-Translate** 项目。

相关链接:

- [B 站 Index-Translate 项目](https://github.com/bilibili/Index-Translate)
- [Index Translate Bridge 仓库](https://github.com/Siyin22/IndexTranslateBridge)
- [最新版本下载](https://github.com/Siyin22/IndexTranslateBridge/releases/latest)
- [完整配置说明与常见问题](https://github.com/Siyin22/IndexTranslateBridge#readme)

更多详细信息请查看项目的 README.md 文件。
