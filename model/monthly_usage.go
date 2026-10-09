package model

type UserMonthlyUsage struct {
	Id                        int64  `json:"id"`
	UserId                    int    `json:"user_id" gorm:"uniqueIndex:idx_monthly_usage_user_period,priority:1;index"`
	Period                    string `json:"period" gorm:"type:char(7);uniqueIndex:idx_monthly_usage_user_period,priority:2;index"`
	Timezone                  string `json:"timezone" gorm:"type:varchar(64)"`
	PeriodStart               int64  `json:"period_start" gorm:"bigint;index"`
	PeriodEnd                 int64  `json:"period_end" gorm:"bigint"`
	WalletConsumedQuota       int64  `json:"wallet_consumed_quota" gorm:"bigint"`
	SubscriptionConsumedQuota int64  `json:"subscription_consumed_quota" gorm:"bigint"`
	RefundQuota               int64  `json:"refund_quota" gorm:"bigint"`
	NetConsumedQuota          int64  `json:"net_consumed_quota" gorm:"bigint"`
	RequestCount              int64  `json:"request_count" gorm:"bigint"`
	UpdatedAt                 int64  `json:"updated_at" gorm:"autoUpdateTime"`
}
