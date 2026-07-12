package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// lockForUpdate makes the next query emit SELECT ... FOR UPDATE so matched
// rows remain locked until the surrounding transaction ends. GORM v2 ignores
// the legacy gorm:query_option form used by GORM v1.
//
// SQLite does not support FOR UPDATE. Its single-writer transaction model is
// used instead, while MySQL and PostgreSQL receive an explicit row lock.
func lockForUpdate(tx *gorm.DB) *gorm.DB {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return tx
	}
	return tx.Clauses(clause.Locking{Strength: "UPDATE"})
}
