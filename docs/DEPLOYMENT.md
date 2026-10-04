# 静态部署

部署整个 `dist/`，保留 `atlas/`、`vendor/` 和相对路径。无需服务端数据库、账号密钥或构建步骤。

## Nginx 示例

将网页文件放在 `/var/www/anatomy/`，再把以下片段加入已有的 HTTPS `server` 块。请按自己的目录和域名调整：

```nginx
location = /anatomy {
    return 301 /anatomy/;
}

location ^~ /anatomy/ {
    alias /var/www/anatomy/;
    index index.html;
    autoindex off;
    charset utf-8;
    add_header X-Content-Type-Options nosniff always;
}
```

确保 Nginx 正确加载 `mime.types`，JavaScript 以有效的 JS MIME 类型返回。`*.bin.gz` 是由网页自行解压的二进制资源，应作为原始文件提供，不能给它们附加 `Content-Encoding: gzip` 让浏览器提前解压，否则长度校验会失败。

检查配置后再重载：

```bash
nginx -t
systemctl reload nginx
```

## 上线核验

1. 页面、`atlas/manifest.json`、模型 gzip 文件及 `vendor/three.module.js` 均可访问。
2. 浏览器状态最终显示 `3210 个已加载 / 3210 个总结构`，没有失败批次。
3. 实际测试结构检索、单项显隐、组合选择、视角与参数变化。
4. 检查 `credits.html` 的数据署名与作者信息。

已有演示站点：https://zengmx.com/anatomy/ 。仓库提交不会自动更新该服务器。

本仓库不包含服务器账号、SSH 凭据、本机托管配置或生产运维脚本。升级时建议使用独立发布目录并保留可回退版本。
