---
title: 吐槽一下Xiaomi Mimo Desktop
date: 2026-09-22 18:58:44
updated: 2026-10-02 22:33:41
permalink: 2026/09/22/AI-Roasting-Xiaomi-Mimo-Desktop/
categories: AI
tags: AI
---
本文仅吐槽Xiaomi Mimo Desktop这款桌面端Agent，有些很神秘的小问题。笔者对Mimo V2.6系列的两款模型认可度较高，投入实际工作后效果也不错，偶发的雷霆大思考和输出较慢不算什么大问题，就不展开说了。
文章内容纯主观，大家当个乐子看就行。
***
## Ⅰ. 概览
个人觉得，它的前辈——Mimo Code CLI，是一款完成度不那么理想的Agent，存在以下问题：会话管理做得非常灾难，部分工具调用做得很差，本家的网络服务兼容性较差等。Xiaomi Mimo Desktop对比前辈已经取得了巨大的进步，但也同样继承了前辈的一些缺陷，个人觉得，整体从“不好用”提升到了“用着还行”的水平。
***
## Ⅱ. 会话管理
先夸一夸它吧，桌面端终于有了非常合理的会话管理配置。
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922172047998.png)
夸完了，接下来开始吐槽，这个**删除会话**功能继承了原来Mimo Code CLI的问题，删了，但不一定真的删了……你在这次使用过程中删掉了，下次重新打开Xiaomi Mimo Desktop，这个会话可能就又出现了，厉不厉害你米哥。
解决方案是，使用**归档会话**功能，之后有空了去设置→已归档会话里批量删除。
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922173329507.png)
***
## Ⅲ. 工具
我不太能理解的一个点，为什么国内版本的Xiaomi Mimo Desktop，将我们熟悉的plugin、skill、mcp全都扔到了左上角的这个插件页面里：
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922173900162.png)
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922174127139.png)
我觉得这样挺乱，在输入“/”后，明明Agent本身也有做区分，为什么要全部扔到一起去呢，实际管理起来挺不舒服的。
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922174304893.png)
***
## Ⅳ. 网络服务
用过类似OpenCode、Claude Code等Agent的同志们，应该有被webfetch和websearch折磨过吧……巧了，我们米哥也有这个问题，官方的“联网搜索插件”我已经开通了，但：
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922174830131.png)
我检查了一下，遇到了两个问题：
1. 它的后台并没有识别到我已经开启了“联网搜索插件”，但实际上我在官网已经明确开通了，余额也充足。
2. 经过测试，webfetch本身是能用的，但访问个别网址（如huggingface）时，会报“Transport error”的错误，我肯定是开启了科学上网的，反复检查后也没有别的问题。经过测试，也是和OpenCode一样，要开TUN模式才可以正常访问这些网址。

解决方案是，禁用原生的webfetch和websearch，自己配网络服务用的MCP。我配了两个，Tavily和Exa。
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922182649576.png)
配置好后就能正常使用咯。
![image.png](https://siyin-obsidian.oss-cn-guangzhou.aliyuncs.com/%E5%9B%BE%E5%BA%8A/20260922182337283.png)
贴一下网址，一般来说配一个就够了，我用得多所以配了俩，呼呼：
https://dashboard.exa.ai
https://app.tavily.com
