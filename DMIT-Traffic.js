/*
 * Surge information panel for DMIT VPS traffic.
 * Queries the local vnstat HTTP service on the VPS through proxy tunnel.
 * Module arguments: MONTHLY_GB (monthly traffic limit in GB), RESET_DAY (day of month when traffic resets)
 */

const API_ENDPOINT = "http://traffic.local:19090/stats";

function parseArguments(raw) {
  const result = {};
  String(raw || "")
    .split("&")
    .forEach((item) => {
      const separator = item.indexOf("=");
      if (separator < 0) return;
      const key = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      result[key] = value;
    });
  return result;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "未知";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const digits = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}

function finishWithError(message) {
  $done({
    title: "DMIT VPS",
    content: message,
    style: "error",
  });
}

function getDaysUntilReset(resetDay) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Target reset date this month
  let resetDate = new Date(year, month, resetDay);

  // If reset day has passed this month, next reset is next month
  if (now > resetDate) {
    resetDate = new Date(year, month + 1, resetDay);
  }

  const diffMs = resetDate - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const args = parseArguments(typeof $argument === "undefined" ? "" : $argument);
const monthlyGb = parseFloat(args.MONTHLY_GB);
const resetDay = parseInt(args.RESET_DAY, 10);

if (!monthlyGb || monthlyGb <= 0 || !resetDay || resetDay < 1 || resetDay > 31) {
  finishWithError("请先在模组参数中填写 MONTHLY_GB 和 RESET_DAY");
} else {
  $httpClient.get(
    {
      url: API_ENDPOINT,
      timeout: 8,
      "auto-cookie": false,
    },
    (error, response, body) => {
      if (error) {
        finishWithError(`查询失败：${error}`);
        return;
      }

      if (!response || response.status !== 200) {
        finishWithError(`流量服务返回 HTTP ${response?.status || "未知"}`);
        return;
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch (_) {
        finishWithError("流量数据解析失败");
        return;
      }

      if (data.error || data.status !== "ok") {
        finishWithError(`服务错误：${data.error || "未知"}`);
        return;
      }

      const used = Number(data.total_bytes);
      if (!Number.isFinite(used)) {
        finishWithError("流量数据无效");
        return;
      }

      const totalBytes = monthlyGb * 1024 * 1024 * 1024;
      const remaining = Math.max(totalBytes - used, 0);
      const percentage = Math.min(Math.max((used / totalBytes) * 100, 0), 100);
      const daysLeft = getDaysUntilReset(resetDay);

      const style = percentage >= 90 ? "error" : percentage >= 75 ? "alert" : "good";

      $done({
        title: `DMIT VPS · ${percentage.toFixed(1)}%`,
        content: [
          `已用：${formatBytes(used)} / ${monthlyGb} GB`,
          `剩余：${formatBytes(remaining)} (${daysLeft} 天后重置)`,
        ].join("\n"),
        style,
      });
    }
  );
}
