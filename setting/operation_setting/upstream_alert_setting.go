package operation_setting

import (
	"github.com/QuantumNous/new-api/setting/config"
)

// UpstreamAlertSetting 上游账号余额监控的提醒配置
type UpstreamAlertSetting struct {
	EmailEnabled      bool   `json:"email_enabled"`
	NotificationEmail string `json:"notification_email"`
}

var upstreamAlertSetting = UpstreamAlertSetting{
	EmailEnabled:      false,
	NotificationEmail: "",
}

func init() {
	config.GlobalConfig.Register("upstream_alert_setting", &upstreamAlertSetting)
}

func GetUpstreamAlertSetting() *UpstreamAlertSetting {
	return &upstreamAlertSetting
}
