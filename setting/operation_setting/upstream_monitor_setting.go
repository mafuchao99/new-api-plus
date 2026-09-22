package operation_setting

import (
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// UpstreamMonitorSetting 上游账号余额定时查询配置
//
// 高峰/低谷两个时段各自配置查询间隔，运行中的调度器每次轮询都会重新求值，
// 因此修改后无需重启即可生效（最迟约 15 秒）。
type UpstreamMonitorSetting struct {
	Enabled         bool `json:"enabled"`
	PeakStartHour   int  `json:"peak_start_hour"`
	PeakEndHour     int  `json:"peak_end_hour"`
	PeakInterval    int  `json:"peak_interval"`
	OffPeakInterval int  `json:"off_peak_interval"`
}

const (
	UpstreamMonitorMinIntervalMinutes = 1
	UpstreamMonitorMaxIntervalMinutes = 24 * 60
)

var upstreamMonitorSetting = UpstreamMonitorSetting{
	Enabled:         true,
	PeakStartHour:   9,
	PeakEndHour:     23,
	PeakInterval:    10,
	OffPeakInterval: 60,
}

func init() {
	config.GlobalConfig.Register("upstream_monitor_setting", &upstreamMonitorSetting)
}

func GetUpstreamMonitorSetting() *UpstreamMonitorSetting {
	return &upstreamMonitorSetting
}

// CurrentIntervalMinutes 当前时刻应使用的查询间隔（分钟）
func (setting *UpstreamMonitorSetting) CurrentIntervalMinutes(now time.Time) int {
	if setting.InPeakHours(now) {
		return NormalizeUpstreamMonitorInterval(setting.PeakInterval)
	}
	return NormalizeUpstreamMonitorInterval(setting.OffPeakInterval)
}

// InPeakHours 判断是否处于高峰时段
// 起始与结束相同视为全天；起始大于结束视为跨天（例如 22 点到次日 6 点）
func (setting *UpstreamMonitorSetting) InPeakHours(now time.Time) bool {
	hour := now.Hour()
	start := NormalizeUpstreamMonitorHour(setting.PeakStartHour)
	end := NormalizeUpstreamMonitorHour(setting.PeakEndHour)
	if start == end {
		return true
	}
	if start < end {
		return hour >= start && hour < end
	}
	return hour >= start || hour < end
}

func NormalizeUpstreamMonitorInterval(minutes int) int {
	if minutes < UpstreamMonitorMinIntervalMinutes {
		return UpstreamMonitorMinIntervalMinutes
	}
	if minutes > UpstreamMonitorMaxIntervalMinutes {
		return UpstreamMonitorMaxIntervalMinutes
	}
	return minutes
}

func NormalizeUpstreamMonitorHour(hour int) int {
	if hour < 0 {
		return 0
	}
	if hour > 23 {
		return 23
	}
	return hour
}
