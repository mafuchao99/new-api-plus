package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateTaskDurationBounds(t *testing.T) {
	tests := []struct {
		name    string
		req     TaskSubmitReq
		wantErr bool
	}{
		{name: "empty uses downstream default", req: TaskSubmitReq{}, wantErr: false},
		{name: "duration at limit", req: TaskSubmitReq{Duration: MaxTaskDurationSeconds}, wantErr: false},
		{name: "duration above limit", req: TaskSubmitReq{Duration: MaxTaskDurationSeconds + 1}, wantErr: true},
		{name: "negative duration", req: TaskSubmitReq{Duration: -1}, wantErr: true},
		{name: "seconds at limit", req: TaskSubmitReq{Seconds: "3600"}, wantErr: false},
		{name: "seconds above limit", req: TaskSubmitReq{Seconds: "3601"}, wantErr: true},
		{name: "seconds parse overflow", req: TaskSubmitReq{Seconds: "999999999999999999999999"}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTaskDurationBounds(tt.req)
			if tt.wantErr {
				require.NotNil(t, err)
				return
			}
			require.Nil(t, err)
		})
	}
}
