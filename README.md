# 当前域名 Cookie 管理器

这是一个 Manifest V3 Chrome 扩展：

- 在当前普通网站页面导出该域名可见的 Cookie 为 JSON 文件；
- 在同一网站域名页面导入 JSON 文件，恢复登录态；
- 导入时校验文件域名与当前页面域名，避免误写入其他网站。

## 安装

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录。
4. 打开目标网站，点击扩展图标即可使用。

Cookie 文件等同于登录凭证，请**只保存和分享给可信的人**。导入完成后刷新当前页面使登录态生效。部分浏览器内置保护 Cookie、分区 Cookie 或站点策略可能拒绝导入，插件会在导入结果中显示失败数量。

<img width="380" height="439" alt="image" src="https://github.com/user-attachments/assets/58d9b8b3-75d8-4158-9d67-7dd30ae04112" />
