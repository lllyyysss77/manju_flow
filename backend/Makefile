.PHONY: all build run clean test tidy migrate

# 默认目标
all: build

# 下载依赖
tidy:
	go mod tidy

# 构建
build: tidy
	go build -o bin/manju-flow ./cmd/main.go

# 运行（开发模式）
run:
	go run ./cmd/main.go

# 清理
clean:
	rm -rf bin/
	rm -f *.db

# 测试
test:
	go test -v ./...

# 显式执行场景资产迁移；生产环境必须先备份并安排维护窗口。
migrate:
	go run ./cmd/migrate

# Docker 构建
docker-build:
	docker build -t manju-flow-backend .

# Docker 运行
docker-run:
	docker run -p 8080:8080 manju-flow-backend
