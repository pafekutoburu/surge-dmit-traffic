# Surge DMIT Traffic

Surge iOS / macOS 信息面板，显示 DMIT VPS 月度流量使用情况。

## 工作原理

```
Surge 面板 → 代理隧道 → VPS sing-box → route: traffic.local → 127.0.0.1:19090
→ Python 服务读取 vnstat → 返回 JSON → 面板展示
```

流量数据来自 VPS 本地运行的 vnstat，通过代理隧道访问，不依赖任何第三方 API。

## 显示内容

- 本月已用流量 / 套餐总量
- 使用百分比（75% 黄色警告，90% 红色警告）
- 剩余流量 + 距下次重置天数

## VPS 端部署

### 1. 安装 vnstat

```bash
apt install -y vnstat
```

### 2. 部署流量查询服务

```bash
# 下载脚本
curl -sSL -o /usr/local/bin/dmit-traffic-server.py https://raw.githubusercontent.com/pafekutoburu/surge-dmit-traffic/main/scripts/dmit-traffic-server.py

# 加执行权限
chmod +x /usr/local/bin/dmit-traffic-server.py
```

### 3. 创建 systemd 服务

```bash
cat > /etc/systemd/system/dmit-traffic.service << 'EOF'
[Unit]
Description=DMIT VPS Traffic Monitor
After=network.target vnstat.service
Requires=vnstat.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /usr/local/bin/dmit-traffic-server.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now dmit-traffic
```

### 4. 添加 hosts 记录

```bash
echo '127.0.0.1 traffic.local' >> /etc/hosts
```

### 5. sing-box 添加 route 规则

在 `/etc/sing-box/config.json` 中添加：

```json
"route": {
  "rules": [
    {
      "domain": ["traffic.local"],
      "outbound": "direct"
    }
  ]
}
```

然后 `systemctl restart sing-box`。

## Surge 端安装

在 Surge 的「安装新模组」中输入：

```
https://raw.githubusercontent.com/pafekutoburu/surge-dmit-traffic/main/DMIT-Traffic.sgmodule
```

### 参数填写

| 参数 | 说明 | 示例 |
|------|------|------|
| `MONTHLY_GB` | DMIT 套餐月流量上限（GB） | `1000` |
| `RESET_DAY` | 每月流量重置日（1-31） | `1` |

## 安全

- 仓库不包含任何密钥、IP 地址或敏感信息
- 流量数据仅在 VPS 本地查询，不经过第三方
- vnstat 和流量服务仅监听 `127.0.0.1`，互联网无法直接访问
