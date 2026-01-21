# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also: `../CLAUDE.md` for full project documentation including data models and API routes.

## Development Commands

```bash
make run          # Start dev server (http://localhost:8080)
make build        # Build binary to bin/manju-flow
make test         # Run all tests
make tidy         # Download/update dependencies
make clean        # Remove bin/ and *.db files
```

Docker:
```bash
make docker-build   # Build image
make docker-run     # Run container on port 8080
```

## Architecture

```
cmd/main.go                    # Entry point, loads config and starts server
internal/
├── config/config.go           # Environment-based configuration
├── database/database.go       # GORM setup with auto-migration
├── middleware/auth.go         # Token-based auth middleware
├── handlers/                  # Request handlers (one file per domain)
├── models/                    # GORM models with soft delete
├── oss/client.go              # Aliyun OSS client wrapper
└── routes/routes.go           # All route definitions
```

**Request flow**: `main.go` → `routes.Setup()` → middleware → handler → `database.GetDB()` → response

## Key Patterns

### Handler Structure
```go
type BookHandler struct{}

func NewBookHandler() *BookHandler { return &BookHandler{} }

func (h *BookHandler) List(c *gin.Context) {
    db := database.GetDB()
    // Query and respond
}
```

### Adding New Routes
Edit `internal/routes/routes.go`. Routes requiring auth go under `authorized.Group("")`.

### Database Access
- Always use `database.GetDB()` to get the GORM instance
- All models include `gorm.DeletedAt` for soft delete
- Foreign keys disabled at DB level (`constraint:false`); enforce in handler logic
- Use `float64` for `Index` fields to support mid-list insertion: `(prev + next) / 2`

### SQL Reserved Words
The word `index` is reserved in SQL. Always use backticks in GORM queries:
```go
db.Order("`index` ASC")
```

### Version History Pattern
Entities like animations, audio, and videos support versioning:
1. Main table tracks current version number
2. Separate `*Version` table stores all versions
3. Upload creates new version; revert copies old version data to main table

## Environment Variables

Required for MySQL:
```
DB_DRIVER=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=manju_flow
```

Optional for file uploads:
```
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET_NAME=...
```

## Testing

```bash
make test                           # Run all tests
go test -v ./internal/handlers/...  # Test handlers only
go test -v -run TestBookList ./...  # Run specific test
```
