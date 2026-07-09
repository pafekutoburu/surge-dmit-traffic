#!/usr/bin/env python3
"""
DMIT VPS 流量查询服务
监听 127.0.0.1:19090，读取 vnstat 月度数据返回 JSON
"""

import json
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 19090
BIND = "127.0.0.1"


def get_traffic_data():
    """调用 vnstat --json m 获取本月流量数据"""
    result = subprocess.run(
        ["vnstat", "--json", "m"],
        capture_output=True, text=True, timeout=5
    )
    if result.returncode != 0:
        raise RuntimeError(f"vnstat failed: {result.stderr.strip()}")

    data = json.loads(result.stdout)

    # 提取 eth0 的本月数据
    interfaces = data.get("interfaces", [])
    for iface in interfaces:
        if iface.get("name") == "eth0":
            months = iface.get("traffic", {}).get("month", [])
            if months:
                # 取最新一个月
                latest = months[-1]
                rx = latest.get("rx", 0)  # 下载（入站）
                tx = latest.get("tx", 0)  # 上传（出站）
                total = rx + tx
                return {
                    "rx": rx,           # bytes
                    "tx": tx,           # bytes
                    "total": total,     # bytes
                    "month": latest.get("date", {}).get("month"),
                    "year": latest.get("date", {}).get("year"),
                }

    return None


def format_bytes(value):
    """把字节数格式化为人类可读"""
    units = ["B", "KB", "MB", "GB", "TB"]
    amount = float(value)
    unit_index = 0
    while amount >= 1024 and unit_index < len(units) - 1:
        amount /= 1024
        unit_index += 1
    if amount >= 100 or unit_index == 0:
        return f"{amount:.0f} {units[unit_index]}"
    elif amount >= 10:
        return f"{amount:.1f} {units[unit_index]}"
    else:
        return f"{amount:.2f} {units[unit_index]}"


class TrafficHandler(BaseHTTPRequestHandler):
    """处理 /stats 请求"""

    def do_GET(self):
        if self.path != "/stats":
            self.send_response(404)
            self.end_headers()
            return

        try:
            data = get_traffic_data()
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        if data is None:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "no eth0 data"}).encode())
            return

        response = {
            "rx_bytes": data["rx"],
            "tx_bytes": data["tx"],
            "total_bytes": data["total"],
            "rx_human": format_bytes(data["rx"]),
            "tx_human": format_bytes(data["tx"]),
            "total_human": format_bytes(data["total"]),
            "month": data["month"],
            "year": data["year"],
            "status": "ok",
        }

        body = json.dumps(response, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format, *args):
        """静默日志，不往 stderr 打印每次请求"""
        pass


if __name__ == "__main__":
    server = HTTPServer((BIND, PORT), TrafficHandler)
    print(f"DMIT traffic server listening on {BIND}:{PORT}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
