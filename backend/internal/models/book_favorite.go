package models

import "time"

// BookFavorite 保存用户与作品之间的收藏关系。
type BookFavorite struct {
	UserID    uint      `gorm:"primaryKey;autoIncrement:false" json:"userId"`
	BookID    uint      `gorm:"primaryKey;autoIncrement:false;index" json:"bookId"`
	CreatedAt time.Time `json:"createdAt"`
}

// TableName 指定表名。
func (BookFavorite) TableName() string {
	return "book_favorites"
}
